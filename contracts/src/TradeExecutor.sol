// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
}

/// @title TradeExecutor — executes token swaps via Uniswap-compatible routers.
/// @notice Deployed to Arbitrum Sepolia (Uniswap V3) and Robinhood Chain (stock swaps).
///         Owner-only: the LENITNES backend calls executeTrade on signal detection.
contract TradeExecutor {
    address public owner;
    address public swapRouter;
    uint256 public maxSlippageBps;

    event TradeExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address _swapRouter) {
        owner = msg.sender;
        swapRouter = _swapRouter;
        maxSlippageBps = 300;
    }

    function executeTrade(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external onlyOwner returns (uint256 amountOut) {
        require(tokenIn != address(0) && tokenOut != address(0), "zero address");
        require(amountIn > 0, "zero amount");
        require(swapRouter != address(0), "no router");

        IERC20(tokenIn).approve(swapRouter, amountIn);

        amountOut = ISwapRouter(swapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: 3000,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        emit TradeExecuted(tokenIn, tokenOut, amountIn, amountOut, recipient);
    }

    function setSwapRouter(address _swapRouter) external onlyOwner {
        swapRouter = _swapRouter;
    }

    function setMaxSlippage(uint256 bps) external onlyOwner {
        require(bps <= 1000, "max 10%");
        maxSlippageBps = bps;
    }

    function withdrawToken(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "no balance");
        IERC20(token).transfer(to, balance);
    }

    function withdrawETH(address to) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "no balance");
        (bool success, ) = payable(to).call{value: balance}("");
        require(success, "transfer failed");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    receive() external payable {}
}
