var stake = artifacts.require('./StakeAndYield.sol');
var ert = artifacts.require("./ERT.sol");
var c = artifacts.require('./Controller');

module.exports = function(deployer) {

//	deployer.deploy(ert);

  deployer.deploy(stake,
  	"0xd8C33488B76D4a2C06D5cCB75574f10F6ccaC3D7", //ERT address
  	"0x80aB141F324C3d6F2b18b030f1C4E95d4d658778",
  	"0x80aB141F324C3d6F2b18b030f1C4E95d4d658778",
  	"15000000000000000",
  	"0xd9775d818FC23e07aC4b8eFd4C58972F7c59BC0f",
  	"0x783Eeba64cd5b29A0F711ecc954A164DB1CE0bcc",
  	true
  );

  //deployer.deploy(c);

};
