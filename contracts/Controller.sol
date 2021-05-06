pragma solidity 0.6.12;

//import "zeppelin-solidity/contracts/math/SafeMath.sol";
//import "zeppelin-solidity/contracts/ownership/Ownable.sol";

import "./SafeMath.sol";
import "./Ownable.sol";

interface StandardToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
	function approve(address spender, uint256 amount) external returns (bool);
}

interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        payable
        returns (uint[] memory amounts);
        
    function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        returns (uint[] memory amounts);
}

interface IYearnWETH{
    function balanceOf(address account) external view returns (uint256);
    function withdraw(uint256 amount, address recipient) external returns(uint256);
    function pricePerShare() external view returns(uint256);
    function deposit(uint256 _amount) external returns(uint256);
    function deposit(uint256 _amount, address recipient) external returns(uint256);
}

interface IWETH is StandardToken{
    function withdraw(uint256 amount) external returns(uint256);
    function deposit() external payable;
}

interface IStakeAndYield {
    function getRewardToken() external view returns(address);
    function totalSupply(uint256 stakeType) external view returns(uint256);
    function notifyRewardAmount(uint256 reward, uint256 stakeType) external;
}

interface IAutomaticMarketMaker {
    function buy(uint256 _tokenAmount) external payable;
    function sell(uint256 tokenAmount, uint256 _etherAmount) external;
    function calculatePurchaseReturn(uint256 etherAmount) external returns (uint256);
    function calculateSaleReturn(uint256 tokenAmount) external returns (uint256);
    function withdrawPayments(address payable payee) external;
}

contract Controller is Ownable {
    using SafeMath for uint256;
    uint256 MAX_INT = type(uint256).max;
    IWETH public weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public DEUS = 0x3b62F3820e0B035cc4aD602dECe6d796BC325325;

    IUniswapV2Router02 public uniswapRouter = IUniswapV2Router02(
    	0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
    );

    IYearnWETH public yweth = IYearnWETH(0xa9fE4601811213c340e850ea305481afF02f5b28);

    IAutomaticMarketMaker public AMM = IAutomaticMarketMaker(0xD77700fC3C78d1Cb3aCb1a9eAC891ff59bC7946D);

    // strategy => vault
    mapping (address => address) public strategies;

    // vault => strategy
    mapping (address => address) public vaults;

    // vault => exitToken
    mapping (address => address) public exitTokens;

    // vault => multiplier
    mapping (address => uint256) public multipliers;

    address public operator;

    uint256 public minBuyFromAMM = 1 ether;



    modifier onlyOwnerOrOperator(){
        require(
            msg.sender == owner() || msg.sender == operator,
            "!owner"
        );
        _;
    }

    constructor() public{
  //  		StandardToken(weth).approve(address(uniswapRouter), MAX_INT);
		// StandardToken(weth).approve(address(yweth), MAX_INT);

  //       StandardToken(DEUS).approve(address(uniswapRouter), MAX_INT);
    }

    modifier onlyStragey(){
    	require(strategies[msg.sender] != address(0), "!strategy");
    	_;
    }

    modifier onlyVault(){
    	require(vaults[msg.sender] != address(0), "!vault");
    	_;
    }

    modifier onlyExitableVault(){
        require(vaults[msg.sender] != address(0) &&
            exitTokens[msg.sender] != address(0)
            , "!exitable vault");
        _;
    }

    receive() external payable {
	}

    function depositWETH() external payable{
        weth.deposit{value: msg.value}();
    }

	function addStrategy(address vault, address strategy, 
        address exitToken, uint256 multiplier
        ) external onlyOwner{
		require(vault != address(0) && strategy!=address(0), "0x0");
		strategies[strategy] = vault;
		vaults[vault] = strategy;

        exitTokens[vault] = exitToken;
        multipliers[vault] = multiplier;

		//StandardToken(weth).approve(strategy, MAX_INT);
	}

	function delStrategy(address vault, address strategy) external onlyOwner{
		require(vault != address(0) && strategy!=address(0), "0x0");
		strategies[strategy] = address(0);
		vaults[vault] = address(0);
		StandardToken(weth).approve(strategy, 0);
	}

    function setOperator(address _addr) public onlyOwner{
        operator = _addr;
    }

    function setMultiplier(
        address vault, 
        uint256 multiplier
    ) external onlyOwnerOrOperator{
        require(vaults[vault] != address(0), "!vault");
        multipliers[vault] = multiplier;
    }

	function withdrawETH(uint256 amount) public onlyStragey{
		msg.sender.transfer(amount);
	}

    function sendExitToken(
        address _user,
        uint256 _amount
    ) public onlyExitableVault{
        uint256 amount = _amount.mul(multipliers[msg.sender]).div(1 ether);
        require(amount > 0, "0 amount");
        StandardToken(exitTokens[msg.sender]).transfer(
            _user, amount
        );
    }

	function depositForStrategy(uint256 amount, address addr) public onlyStragey{
		yweth.deposit(amount, addr);
	}

	function buyForStrategy(
		uint256 amount,
        address rewardToken,
        address recipient
    ) public onlyStragey{
    	
    	address[] memory path;

        uint256[] memory amounts;
        uint256 tokenAmount = amount;

        if(amount < minBuyFromAMM){
        	path[0] = address(weth);
        	path[1] = DEUS;
        	path[2] = rewardToken;

        }else{
            path[0] = DEUS;
            path[1] = rewardToken;

            weth.withdraw(amount);
            tokenAmount = AMM.calculatePurchaseReturn(amount);
            AMM.buy{value: amount}(tokenAmount);
        }

        amounts = uniswapRouter.swapExactTokensForTokens(
            tokenAmount, 1, path, recipient, block.timestamp
        );

    	IStakeAndYield(recipient).notifyRewardAmount(
    		amounts[amounts.length-1], 
    		2 // yield
    	);
	}

    function setMinBuyFromAMM(uint256 _val) public onlyOwner{
        minBuyFromAMM = _val;
    }

	function emergencyWithdrawETH(uint256 amount, address addr) public onlyOwner{
		require(addr != address(0));
		payable(addr).transfer(amount);
	}

	function emergencyWithdrawERC20Tokens(address _tokenAddr, address _to, uint _amount) public onlyOwner {
        StandardToken(_tokenAddr).transfer(_to, _amount);
    }

    function getStrategy(address vault) public view returns(address){
        return vaults[vault];
    }
}
