// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
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
    function exactInputSingle(ExactInputSingleParams calldata params)
        external payable returns (uint256 amountOut);
}

/// @title StockMarket — fixed-rate OTC market maker for Robinhood Chain stock tokens.
/// @notice Implements ISwapRouter so TradeExecutor can use it as a drop-in swap router.
///         The owner funds the contract with USDG + stock tokens and sets exchange rates.
contract StockMarket is ISwapRouter {
    address public owner;

    // stock token address => price in USDG (scaled 1e18, e.g. 250e18 = $250/share)
    mapping(address => uint256) public stockPrices;

    event StockPriceSet(address indexed stock, uint256 price);
    event LiquidityAdded(address indexed token, uint256 amount);
    event TradeRouted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setStockPrice(address stock, uint256 priceInUsdg) external onlyOwner {
        stockPrices[stock] = priceInUsdg;
        emit StockPriceSet(stock, priceInUsdg);
    }

    function fund(address token, uint256 amount) external onlyOwner {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit LiquidityAdded(token, amount);
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external payable override returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "zero amount");

        // Buy stock: USDG → stock token
        if (stockPrices[params.tokenOut] > 0) {
            uint256 price = stockPrices[params.tokenOut];
            amountOut = (params.amountIn * 1e18) / price;
            require(amountOut >= params.amountOutMinimum, "insufficient output");
            IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
            IERC20(params.tokenOut).transfer(params.recipient, amountOut);
            emit TradeRouted(params.tokenIn, params.tokenOut, params.amountIn, amountOut);
            return amountOut;
        }

        // Sell stock: stock token → USDG
        if (stockPrices[params.tokenIn] > 0) {
            uint256 price = stockPrices[params.tokenIn];
            amountOut = (params.amountIn * price) / 1e18;
            require(amountOut >= params.amountOutMinimum, "insufficient output");
            IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
            IERC20(params.tokenOut).transfer(params.recipient, amountOut);
            emit TradeRouted(params.tokenIn, params.tokenOut, params.amountIn, amountOut);
            return amountOut;
        }

        revert("no price set for token pair");
    }

    function withdrawToken(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(to, balance);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }
}
