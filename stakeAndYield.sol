pragma solidity 0.6.12;

//import "zeppelin-solidity/contracts/math/SafeMath.sol";
//import "zeppelin-solidity/contracts/ownership/Ownable.sol";

import "./SafeMath.sol";
import "./Ownable.sol";

interface StakedToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface RewardToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract Staking is Ownable {
    //TODO: define constants for YIELD, STAKE, BOTH
    uint256 public PERIOD = 24 hours;
    uint256 public lastUpdateTime;
    uint256 public rewardRate;
    uint256 public rewardRateYield;

    uint256 public rewardTillNowPerToken = 0;
    uint256 public yieldRewardTillNowPerToken = 0;

    uint256 public _totalSupply = 0;
    uint256 public _totalSupplyYield = 0;

    struct User {
        uint256 depositAmount;
        uint256 yieldDepositAmount;
        uint256 bothDepositAmount;

        // When user is staking or withdrawing
        // we will calculate the pending rewards until now
        // and save here
        uint256 paidReward;
        uint256 yieldPaidReward;

        uint256 paidRewardPerToken;
        uint256 yieldPaidRewardPerToken;
    }

    using SafeMath for uint256;

    mapping (address => User) public users;

    uint256 public lastUpdatedBlock;
    uint256 public rewardPerBlock;
    uint256 public yieldRewardPerBlock;

    uint256 public periodFinish = 0;

    uint256 public scale = 1e18;

    uint256 public daoShare;
    address public daoWallet;

    StakedToken public stakedToken;
    RewardToken public rewardToken;
    RewardToken public yieldRewardToken;

    event Deposit(address user, uint256 amount, uint256 stakeType);
    event Withdraw(address user, uint256 amount, uint256 stakeType);
    event EmergencyWithdraw(address user, uint256 amount);
    event RewardClaimed(address user, uint256 amount, uint256 stakeType);
    event RewardPerBlockChanged(uint256 oldValue, uint256 newValue, uint256 oldYieldValue, uint256 newYeildValue);

    constructor (
		address _stakedToken,
		address _rewardToken,
        address _yieldRewardToken,
		
        /*
        We do not need to specify reward per block.
        some rewards are coming to the contracta and the contract
        will distribute it among all users.
        */

        //uint256 _rewardPerBlock,
        //uint256 _yieldRewardPerBlock,
		uint256 _daoShare,
		address _daoWallet) public {
			
        stakedToken = StakedToken(_stakedToken);
        rewardToken = RewardToken(_rewardToken);
        yieldRewardToken = RewardToken(_yieldRewardToken);
        //rewardPerBlock = _rewardPerBlock;
        //yieldRewardPerBlock = _yieldRewardPerBlock;
        daoShare = _daoShare;
        //lastUpdatedBlock = block.number;
        daoWallet = _daoWallet;
    }

    modifier updateReward(address account, uint256 stakeType) {
        if(stakeType == 1 || stakeType == 3){
            rewardTillNowPerToken = rewardPerToken(1);
            lastUpdateTime = lastTimeRewardApplicable();
            if (account != address(0)) {
                sendReward(
                    account,
                    earned(account, 1),
                    earned(account, 2)
                );
                users[account].paidRewardPerToken = rewardTillNowPerToken;
            }
        }

        if(stakeType == 2 || stakeType == 3){
            yieldRewardTillNowPerToken = rewardPerToken(2);
            lastUpdateTime = lastTimeRewardApplicable();
            if (account != address(0)) {
                sendReward(
                    account,
                    earned(account, 1),
                    earned(account, 2)
                );
                users[account].yieldPaidRewardPerToken = yieldRewardTillNowPerToken;
            }
        }
        _;
    }

    function setDaoWallet(address _daoWallet) public onlyOwner {
        daoWallet = _daoWallet;
    }

    function setDaoShare(uint256 _daoShare) public onlyOwner {
        daoShare = _daoShare;
    }

    function earned(address account, uint256 stakeType) public view returns(uint256) {
        User storage user = users[account];
        
        uint256 paidPerToken = stakeType == 1 ? 
            user.paidRewardPerToken : user.yieldPaidRewardPerToken;

        return balanceOf(account, stakeType).mul(
            rewardPerToken(stakeType).
            sub(paidPerToken)
        ).div(1e18);
    }

    // function setRewardPerBlock(uint256 _rewardPerBlock, uint256 _yieldRewardPerBlock) public onlyOwner {
    //     update();
    //     emit RewardPerBlockChanged(rewardPerBlock, _rewardPerBlock, yieldRewardPerBlock, _yieldRewardPerBlock);
    //     rewardPerBlock = _rewardPerBlock;
    //     yieldRewardPerBlock = _yieldRewardPerBlock;
    // }

    // Update reward variables of the pool to be up-to-date.
    // function update() public {
    //     if (block.number <= lastUpdatedBlock) {
    //         return;
    //     }
    //     uint256 totalStakedToken = stakedToken.balanceOf(address(this));
    //     uint256 rewardAmount = (block.number - lastUpdatedBlock).mul(rewardPerBlock);

    //     rewardTillNowPerToken = rewardTillNowPerToken.add(rewardAmount.mul(scale).div(totalStakedToken));
    //     yieldRewardTillNowPerToken = yieldRewardTillNowPerToken.add(rewardAmount.mul(scale).div(totalStakedToken));
    //     lastUpdatedBlock = block.number;
    // }

    // View function to see pending reward on frontend.
    // function pendingReward(address _user) external view returns (
    //     uint256 reward, 
    //     uint256 yieldReward
    // ) {
    //     User storage user = users[_user];
    //     uint256 accRewardPerToken = rewardTillNowPerToken;
    //     uint256 accYieldRewardPerToken = yieldRewardTillNowPerToken;

    //     if (block.number > lastUpdatedBlock) {
    //         uint256 totalStakedToken = stakedToken.balanceOf(address(this));
    //         uint256 rewardAmount = (block.number - lastUpdatedBlock).mul(rewardPerBlock);
    //         accRewardPerToken = accRewardPerToken.add(rewardAmount.mul(scale).div(totalStakedToken));
    //     }
    //     reward = user.depositAmount.add(user.bothDepositAmount).mul(accRewardPerToken).div(scale).sub(
    //         user.paidReward).mul(daoShare).div(scale);
    //     yieldReward = user.yieldDepositAmount.add(user.bothDepositAmount).mul(accYieldRewardPerToken).div(scale).sub(
    //         user.yieldPaidReward).mul(daoShare).div(scale);
    // }

    //type=1 --> just stake
    //type=2 --> yield
    //type=3 --> both yield and stake
	function deposit(uint256 amount, uint256 stakeType) public {
		depositFor(msg.sender, amount, stakeType);
    }

    function depositFor(address _user, uint256 amount, uint256 stakeType) updateReward(_user, stakeType) public {
        require(stakeType==1 || stakeType ==2 || stakeType==3, "Invalid stakeType");
        User storage user = users[_user];
        //update();

        // uint256 _pendingReward = user.depositAmount.add(user.bothDepositAmount).mul(rewardTillNowPerToken).div(scale).sub(user.paidReward);
        // uint256 _pendingYieldReward = user.yieldDepositAmount.add(
        //         user.bothDepositAmount
        //     ).mul(
        //         yieldRewardTillNowPerToken
        //     ).div(scale).sub(user.yieldPaidReward);
		
        // if(_pendingReward > 0 || _pendingYieldReward > 0)
        //     sendReward(_user, _pendingReward, _pendingYieldReward);

        stakedToken.transferFrom(address(msg.sender), address(this), amount);

        if(stakeType == 1){
            user.depositAmount = user.depositAmount.add(amount);    
        }else if(stakeType == 2){
            user.yieldDepositAmount = user.yieldDepositAmount.add(amount);
        }else{
            user.bothDepositAmount = user.bothDepositAmount.add(amount);
        }
        
        emit Deposit(_user, amount, stakeType);
    }

	function sendReward(address userAddress, uint256 amount, uint256 yieldAmount) private {
        User storage user = users[userAddress];
		uint256 _daoShare = amount.mul(daoShare).div(scale);
        uint256 _yieldDaoShare = yieldAmount.mul(daoShare).div(scale);

        if(amount > 0){
            rewardToken.transfer(userAddress, amount.sub(_daoShare));
            rewardToken.transfer(daoWallet, _daoShare);
            user.paidReward = user.paidReward.add(
                amount
            );
        }

        if(yieldAmount > 0){
            yieldRewardToken.transfer(userAddress, yieldAmount.sub(_yieldDaoShare));
            yieldRewardToken.transfer(daoWallet, _yieldDaoShare);   
            
            user.yieldPaidReward = user.yieldPaidReward.add(
                yieldAmount
            );
        }
        
        if(amount > 0 || yieldAmount > 0){
            emit RewardClaimed(userAddress, amount, yieldAmount);
        }
	}

    //TODO: lock token or ask the controller to 
    //withdraw from yearn for YIELD and BOTH
    function withdraw(uint256 amount, uint256 stakeType) updateReward(msg.sender, stakeType) public {
        require(stakeType==1 || stakeType ==2 || stakeType==3, "Invalid stakeType");
        User storage user = users[msg.sender];
        require(
            (stakeType==1 && user.depositAmount > amount) ||
            (stakeType==2 && user.yieldDepositAmount > amount) || 
            (stakeType==3 && user.bothDepositAmount > amount)
         , "withdraw > deposit");

  //       uint256 _pendingReward = user.depositAmount.add(
  //           user.bothDepositAmount
  //       ).mul(rewardTillNowPerToken).div(scale).sub(user.paidReward);

  //       uint256 _yieldPendingReward = user.yieldDepositAmount.add(
  //           user.bothDepositAmount
  //       ).mul(yieldRewardTillNowPerToken).div(scale).sub(user.yieldPaidReward);

		// sendReward(msg.sender, _pendingReward, _yieldPendingReward);

        if (amount > 0) {
            if(stakeType == 1){
                user.depositAmount = user.depositAmount.sub(amount);
            }else if (stakeType == 2){
                user.yieldDepositAmount = user.yieldDepositAmount.sub(
                    amount
                );
            }else{
                user.bothDepositAmount = user.bothDepositAmount.sub(
                    amount
                );
            }
            stakedToken.transfer(address(msg.sender), amount);
            emit Withdraw(msg.sender, amount, stakeType);
        }

        //user.paidReward = user.depositAmount.mul(rewardTillNowPerToken).div(scale);
    }

    // TODO: restrict this function.
    // just Controller and admin should be able to call this
    function notifyRewardAmount(uint256 reward, uint256 stakeType) public  updateReward(address(0), stakeType) {
        if (block.timestamp >= periodFinish) {
            if(stakeType == 1){
                rewardRate = reward.div(PERIOD);    
            }else{
                rewardRateYield = reward.div(PERIOD);
            }
        } else {
            uint256 remaining = periodFinish.sub(block.timestamp);
            if(stakeType == 1){
                uint256 leftover = remaining.mul(rewardRate);
                rewardRate = reward.add(leftover).div(PERIOD);    
            }else{
                uint256 leftover = remaining.mul(rewardRateYield);
                rewardRateYield = reward.add(leftover).div(PERIOD);
            }
            
        }
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(PERIOD);
    }

    function balanceOf(address account, uint256 stakeType) public view returns(uint256) {
        User storage user = users[account];
        return user.bothDepositAmount.add(
            stakeType == 1 ? user.depositAmount :
            user.yieldDepositAmount
        );
    }

    function lastTimeRewardApplicable() public view returns(uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
        //return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken(uint256 stakeType) public view returns(uint256) {
        uint256 supply = stakeType == 1 ? _totalSupply : _totalSupplyYield;        
        if (supply == 0) {
            return stakeType == 1 ? rewardTillNowPerToken : yieldRewardTillNowPerToken;
        }
        if(stakeType == 1){
            return rewardTillNowPerToken.add(
                lastTimeRewardApplicable().sub(lastUpdateTime)
                .mul(rewardRate).mul(1e18).div(_totalSupply)
            );
        }else{
            return yieldRewardTillNowPerToken.add(
                lastTimeRewardApplicable().sub(lastUpdateTime).
                mul(rewardRateYield).mul(1e18).div(_totalSupplyYield)
            );
        }
    }

    //TODO: merge below functions into one

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw() public {
        User storage user = users[msg.sender];

        uint256 amount = user.depositAmount.add(
            user.bothDepositAmount).add(user.yieldDepositAmount);
        stakedToken.transfer(msg.sender, amount);

        emit EmergencyWithdraw(msg.sender, amount);

        //TODO: add other fields
        user.depositAmount = 0;
        user.yieldDepositAmount = 0;
        user.bothDepositAmount = 0;
        user.paidReward = 0;
        user.yieldPaidReward = 0;
    }

	function emergencyWithdrawFor(address _user) public onlyOwner{
        User storage user = users[_user];

        uint256 amount = user.depositAmount.add(
            user.bothDepositAmount).add(user.yieldDepositAmount);

        stakedToken.transfer(_user, amount);

        emit EmergencyWithdraw(_user, amount);

        //add other fields
        user.depositAmount = 0;
        user.yieldDepositAmount = 0;
        user.bothDepositAmount = 0;
        user.paidReward = 0;
        user.yieldPaidReward = 0;
    }

    function withdrawRewardTokens(address to, uint256 amount) public onlyOwner {
        rewardToken.transfer(to, amount);
    }
}


//Dar panah khoda