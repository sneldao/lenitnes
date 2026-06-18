// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SignalRegistry} from "../src/SignalRegistry.sol";
import {TradeExecutor} from "../src/TradeExecutor.sol";

contract Deploy is Script {
    // Uniswap V3 SwapRouter on Arbitrum Sepolia
    address constant ARB_SWAP_ROUTER = 0x101F443B4D1b059569C6452319124001853b2156;
    // PancakeSwap V2 router on BSC testnet
    address constant BSC_SWAP_ROUTER = 0xD99D1C33f9fC3444f8101754aBC46B524bA2C6BD;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("EVM_PRIVATE_KEY");

        // Detect target chain from env. To deploy to BSC:
        //   CHAIN=bsc forge script script/Deploy.s.sol --rpc-url $BNB_RPC_URL --broadcast
        // To deploy to Arbitrum (default):
        //   forge script script/Deploy.s.sol --rpc-url $ARBITRUM_RPC_URL --broadcast
        // Override router explicitly:
        //   SWAP_ROUTER=<address> forge script ... --broadcast
        string memory chain = vm.envOr("CHAIN", string("arbitrum"));
        address swapRouter;

        if (keccak256(bytes(chain)) == keccak256(bytes("bsc"))) {
            swapRouter = BSC_SWAP_ROUTER;
        } else {
            swapRouter = ARB_SWAP_ROUTER;
        }

        // Allow explicit override regardless of chain detection
        if (vm.envOr("SWAP_ROUTER", address(0)) != address(0)) {
            swapRouter = vm.envAddress("SWAP_ROUTER");
        }

        vm.startBroadcast(deployerPrivateKey);

        SignalRegistry registry = new SignalRegistry();
        console.log("SignalRegistry:", address(registry));

        TradeExecutor executor = new TradeExecutor(swapRouter);
        console.log("TradeExecutor:", address(executor));

        vm.stopBroadcast();
    }
}
