// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SignalRegistry} from "../src/SignalRegistry.sol";
import {TradeExecutor} from "../src/TradeExecutor.sol";

contract Deploy is Script {
    // Uniswap V3 SwapRouter on Arbitrum Sepolia
    address constant ARB_SWAP_ROUTER = 0x101F443B4D1b059569C6452319124001853b2156;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("EVM_PRIVATE_KEY");
        address swapRouter = vm.envOr("SWAP_ROUTER", ARB_SWAP_ROUTER);

        vm.startBroadcast(deployerPrivateKey);

        SignalRegistry registry = new SignalRegistry();
        console.log("SignalRegistry:", address(registry));

        TradeExecutor executor = new TradeExecutor(swapRouter);
        console.log("TradeExecutor:", address(executor));

        vm.stopBroadcast();
    }
}
