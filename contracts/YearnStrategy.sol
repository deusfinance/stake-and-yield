pragma solidity 0.6.12;

//import "zeppelin-solidity/contracts/math/SafeMath.sol";
//import "zeppelin-solidity/contracts/ownership/Ownable.sol";

import "./SafeMath.sol";
import "./Ownable.sol";

interface StakedToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IStakeAndYield {
    function getRewardToken() external view returns(address);
    function totalSupply(uint256 stakeType) external view returns(uint256);
    function totalYieldWithdrawed() external view returns(uint256);
    function notifyRewardAmount(uint256 reward, uint256 stakeType) external;
}

interface IController {
    function withdrawETH(uint256 amount) external;
    function depositForStrategy(uint256 amount, address addr) external;
    function buyForStrategy(
        uint256 amount,
        address rewardToken,
        address recipient
    ) external;
}

interface IYearnVault {
    function depositETH() external payable;
}

interface IYearnWETH{
    function balanceOf(address account) external view returns (uint256);
    function withdraw(uint256 amount, address recipient) external returns(uint256);
    function pricePerShare() external view returns(uint256);
    function deposit(uint256 _amount) external returns(uint256);
}

interface IWETH is StakedToken{
    function withdraw(uint256 amount) external returns(uint256);
}


contract YearnStrategy is Ownable {
    using SafeMath for uint256;

     uint256 public lastEpochTime;
     uint256 public lastBalance;
     uint256 public lastYieldWithdrawed;

     uint256 public yearFeesPercent = 0;

     uint256 public ethPushedToYearn = 0;

     IStakeAndYield public vault;


    IController public controller;
    
    IYearnWETH public yweth = IYearnWETH(0xa9fE4601811213c340e850ea305481afF02f5b28);
    IWETH public weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    address public operator;


    uint256 public minRewards = 0.01 ether;
    uint256 public minDepositable = 0.05 ether;

    modifier onlyOwnerOrOperator(){
        require(
            msg.sender == owner() || msg.sender == operator,
            "!owner"
        );
        _;
    }

    constructor(
        address _vault,
        address _controller
    ) public{
        vault = IStakeAndYield(_vault);
        controller = IController(_controller);
    }

    // Since Owner is calling this function, we can pass
    // the ETHPerToken amount
    function epoch(uint256 ETHPerToken) public onlyOwnerOrOperator{
        uint256 balance = pendingBalance();
        //require(balance > 0, "balance is 0");
        uint256 withdrawable = harvest(balance.mul(ETHPerToken).div(1 ether));
        lastEpochTime = block.timestamp;
        lastBalance = lastBalance.add(balance);

        uint256 currentWithdrawd = vault.totalYieldWithdrawed();
        uint256 withdrawAmountToken = currentWithdrawd.sub(lastYieldWithdrawed);
        if(withdrawAmountToken > 0){
            lastYieldWithdrawed = currentWithdrawd;
            uint256 ethWithdrawed = withdrawAmountToken.mul(
                ETHPerToken
            ).div(1 ether);
            
            withdrawFromYearn(ethWithdrawed.add(withdrawable));
            ethPushedToYearn = ethPushedToYearn.sub(ethWithdrawed);
        }else{
            if(withdrawable > 0){
                withdrawFromYearn(withdrawable);
            }
        }
    }

    function harvest(uint256 ethBalance) private returns(
        uint256 withdrawable
    ){
        uint256 rewards = calculateRewards();
        uint256 depositable = ethBalance > rewards ? ethBalance.sub(rewards) : 0;
        if(depositable >= minDepositable){
            //deposit to yearn
            controller.depositForStrategy(depositable, address(this));
            ethPushedToYearn = ethPushedToYearn.add(
                depositable
            );
        }

        if(rewards > minRewards){
            withdrawable = rewards > ethBalance ? rewards.sub(ethBalance) : 0;
            // get DEA and send to Vault
            controller.buyForStrategy(
                rewards,
                vault.getRewardToken(),
                address(vault)
            );
        }else{
            withdrawable = 0;
        }
    }

    function withdrawFromYearn(uint256 ethAmount) private returns(uint256){
        uint256 yShares = yweth.balanceOf(address(this));

        uint256 sharesToWithdraw = ethAmount.div(
            yweth.pricePerShare()
        ).mul(1 ether);
        require(yShares >= sharesToWithdraw, "Not enough shares");

        return yweth.withdraw(sharesToWithdraw, address(controller));
    }

    function calculateRewards() public view returns(uint256){
        uint256 yShares = yweth.balanceOf(address(this));
        uint256 yETHBalance = yShares.mul(
            yweth.pricePerShare()
        ).div(1 ether);

        yETHBalance = yETHBalance.mul(1000 - yearFeesPercent).div(1000);
        if(yETHBalance > ethPushedToYearn){
            return yETHBalance - ethPushedToYearn;
        }
        return 0;
    }

    function pendingBalance() public view returns(uint256){
        uint256 vaultBalance = vault.totalSupply(2);
        if(vaultBalance < lastBalance){
            return 0;
        }
        return vaultBalance.sub(lastBalance);
    }

    function getLastEpochTime() public view returns(uint256){
        return lastEpochTime;
    }

    function setYearnFeesPercent(uint256 _val) public onlyOwner{
        yearFeesPercent = _val;
    }

    function setOperator(address _addr) public onlyOwner{
        operator = _addr;
    }

    function setMinRewards(uint256 _val) public onlyOwner{
        minRewards = _val;
    }

    function setMinDepositable(uint256 _val) public onlyOwner{
        minDepositable = _val;
    }

    function setController(address _controller, address _vault) public onlyOwner{
        if(_controller != address(0)){
            controller = IController(_controller);
        }
        if(_vault != address(0)){
            vault = IStakeAndYield(_vault);
        }
    }

    function emergencyWithdrawETH(uint256 amount, address addr) public onlyOwner{
        require(addr != address(0));
        payable(addr).transfer(amount);
    }

    function emergencyWithdrawERC20Tokens(address _tokenAddr, address _to, uint _amount) public onlyOwner {
        StakedToken(_tokenAddr).transfer(_to, _amount);
    }
}
