// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SignalRegistry} from "../src/SignalRegistry.sol";
import {TradeExecutor} from "../src/TradeExecutor.sol";

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
