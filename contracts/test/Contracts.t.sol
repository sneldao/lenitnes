// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SignalRegistry} from "../src/SignalRegistry.sol";
import {TradeExecutor} from "../src/TradeExecutor.sol";
import {StockMarket, ISwapRouter} from "../src/StockMarket.sol";

contract SignalRegistryTest is Test {
    SignalRegistry registry;
    address deployer = address(0x1);
    address user = address(0x2);

    function setUp() public {
        vm.prank(deployer);
        registry = new SignalRegistry();
    }

    function test_recordSignal() public {
        bytes32 hash = keccak256("test-signal");
        vm.prank(user);
        uint256 id = registry.recordSignal(hash, "lenitnes://signal/1");

        SignalRegistry.SignalRecord memory record = registry.getSignal(id);
        assertEq(record.signalHash, hash);
        assertEq(record.recorder, user);
        assertGt(record.timestamp, 0);
        assertEq(registry.signalCount(), 1);
    }

    function test_recordBatch() public {
        bytes32[] memory hashes = new bytes32[](3);
        string[] memory uris = new string[](3);
        for (uint256 i = 0; i < 3; i++) {
            hashes[i] = keccak256(abi.encodePacked("signal", i));
            uris[i] = string(abi.encodePacked("lenitnes://signal/", i));
        }

        vm.prank(user);
        uint256[] memory ids = registry.recordSignalBatch(hashes, uris);

        assertEq(ids.length, 3);
        assertEq(registry.signalCount(), 3);
    }

    function test_batchLengthMismatch() public {
        bytes32[] memory hashes = new bytes32[](2);
        string[] memory uris = new string[](1);

        vm.prank(user);
        vm.expectRevert("length mismatch");
        registry.recordSignalBatch(hashes, uris);
    }

    function test_transferOwnership() public {
        vm.prank(deployer);
        registry.transferOwnership(user);
        assertEq(registry.owner(), user);
    }

    function test_onlyOwnerTransfer() public {
        vm.prank(user);
        vm.expectRevert("not owner");
        registry.transferOwnership(address(0x3));
    }

    function test_duplicateHashReverts() public {
        bytes32 hash = keccak256("test-signal");
        vm.prank(user);
        registry.recordSignal(hash, "lenitnes://signal/1");

        vm.prank(user);
        vm.expectRevert("duplicate hash");
        registry.recordSignal(hash, "lenitnes://signal/1-retry");
    }

    function test_duplicateInBatchReverts() public {
        bytes32 hash = keccak256("already-recorded");
        vm.prank(user);
        registry.recordSignal(hash, "lenitnes://signal/0");

        bytes32[] memory hashes = new bytes32[](2);
        string[] memory uris = new string[](2);
        hashes[0] = keccak256("new-signal");
        hashes[1] = hash;
        uris[0] = "lenitnes://signal/1";
        uris[1] = "lenitnes://signal/0-dup";

        vm.prank(user);
        vm.expectRevert("duplicate hash");
        registry.recordSignalBatch(hashes, uris);
    }
}

contract TradeExecutorTest is Test {
    TradeExecutor executor;
    address deployer = address(0x1);
    address user = address(0x2);
    address mockRouter = address(0x99);

    function setUp() public {
        vm.prank(deployer);
        executor = new TradeExecutor(mockRouter);
    }

    function test_constructor() public view {
        assertEq(executor.owner(), deployer);
        assertEq(executor.swapRouter(), mockRouter);
        assertEq(executor.maxSlippageBps(), 300);
    }

    function test_setSwapRouter() public {
        address newRouter = address(0x100);
        vm.prank(deployer);
        executor.setSwapRouter(newRouter);
        assertEq(executor.swapRouter(), newRouter);
    }

    function test_setMaxSlippage() public {
        vm.prank(deployer);
        executor.setMaxSlippage(500);
        assertEq(executor.maxSlippageBps(), 500);
    }

    function test_slippageTooHigh() public {
        vm.prank(deployer);
        vm.expectRevert("max 10%");
        executor.setMaxSlippage(1001);
    }

    function test_onlyOwner() public {
        vm.prank(user);
        vm.expectRevert("not owner");
        executor.setSwapRouter(address(0x100));
    }

    function test_transferOwnership() public {
        vm.prank(deployer);
        executor.transferOwnership(user);
        assertEq(executor.owner(), user);
    }

    function test_receiveETH() public {
        vm.deal(deployer, 1 ether);
        vm.prank(deployer);
        (bool ok, ) = address(executor).call{value: 0.1 ether}("");
        assertTrue(ok);
        assertEq(address(executor).balance, 0.1 ether);
    }
}

contract MockERC20 {
    string public name;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name) { name = _name; }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract StockMarketTest is Test {
    StockMarket market;
    MockERC20 usdg;
    MockERC20 tsla;
    address deployer = address(0x1);
    address trader = address(0x2);

    function setUp() public {
        vm.startPrank(deployer);
        market = new StockMarket();
        usdg = new MockERC20("USDG");
        tsla = new MockERC20("TSLA");
        // TSLA at $250/share
        market.setStockPrice(address(tsla), 250e18);
        // Fund the market with stock tokens
        tsla.mint(address(market), 100e18);
        usdg.mint(address(market), 100000e18);
        // Give trader some USDG
        usdg.mint(trader, 10000e18);
        vm.stopPrank();
    }

    function test_buyStock() public {
        // Trader buys 1 TSLA for 250 USDG
        vm.prank(trader);
        usdg.approve(address(market), 250e18);

        vm.prank(trader);
        uint256 amountOut = market.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: address(usdg),
                tokenOut: address(tsla),
                fee: 0,
                recipient: trader,
                amountIn: 250e18,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );

        assertEq(amountOut, 1e18);
        assertEq(tsla.balanceOf(trader), 1e18);
        assertEq(usdg.balanceOf(trader), 9750e18);
    }

    function test_sellStock() public {
        vm.prank(deployer);
        tsla.mint(trader, 2e18);

        vm.prank(trader);
        tsla.approve(address(market), 2e18);

        vm.prank(trader);
        uint256 amountOut = market.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: address(tsla),
                tokenOut: address(usdg),
                fee: 0,
                recipient: trader,
                amountIn: 2e18,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );

        assertEq(amountOut, 500e18);
    }

    function test_noPriceReverts() public {
        MockERC20 unknown = new MockERC20("UNKNOWN");
        vm.prank(trader);
        unknown.approve(address(market), 100e18);

        vm.prank(trader);
        vm.expectRevert("no price set for token pair");
        market.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: address(unknown),
                tokenOut: address(usdg),
                fee: 0,
                recipient: trader,
                amountIn: 100e18,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function test_onlyOwnerSetPrice() public {
        vm.prank(trader);
        vm.expectRevert("not owner");
        market.setStockPrice(address(tsla), 999e18);
    }
}
