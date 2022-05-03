const { expect } = require("chai");
const { upgrades } = require("hardhat");

describe("Token Factory", function () {
	let owner, addr1, addr2, addr3, addr4, addrs;
	let ERC777Factory, erc777instance, erc777ExtraInstance;
	let FactoryFactory, factoryInstance;
	let RAIR721Factory, rair721Instance;
	let MinterFactory, minterInstance;
	const initialSupply = 20;
	const tokenPrice = 5;
	const testTokenName = "RAIR Test Token!";
	const collection1Limit = 2;
	const collection2Limit = 10;
	const collection3Limit = 250;
	const collection4Limit = 50;

	const rairFeePercentage = 9000; // 9.000%
	const nodeFeePercentage = 1000; // 1.000%

	const firstDeploymentAddress = '0xfa7a32340ea54A3FF70942B33090a8a9A1B50214';
	const secondDeploymentAddress = '0xED2AB923364a57cDB6d8f23A3180DfD2CF7E209B';
	// Contract addresses are derived from the user's address and the nonce of the transaction,
	//		the generated address will always be the same (on this test file)
	hre.tracer.nameTags[firstDeploymentAddress] = "First Deployment Address";
	hre.tracer.nameTags[secondDeploymentAddress] = "Second Deployment Address";

	before(async function() {
		[owner, addr1, addr2, addr3, addr4, ...addrs] = await ethers.getSigners();	
		ERC777Factory = await ethers.getContractFactory("RAIR777");
		FactoryFactory = await ethers.getContractFactory("RAIR_Token_Factory");
		RAIR721Factory = await ethers.getContractFactory("RAIR_ERC721");
		MinterFactory = await ethers.getContractFactory("Minter_Marketplace");
	});

	describe('Deployments', function() {
		it ("Should deploy the ERC777 contract", async function() {
			erc777instance = await ERC777Factory.deploy(initialSupply, initialSupply * 5, owner.address, [addr1.address]);
			erc777ExtraInstance = await ERC777Factory.deploy(initialSupply * 2, initialSupply * 5, owner.address, [addr2.address]);

			expect(await erc777instance.name()).to.equal("RAIR");
			expect(await erc777instance.symbol()).to.equal("RAIR");
			expect(await erc777instance.decimals()).to.equal(18);
			expect(await erc777instance.granularity()).to.equal(1);
			expect(await erc777instance.totalSupply()).to.equal(initialSupply);
			hre.tracer.nameTags[erc777instance.address] = "First 777 Address";
			hre.tracer.nameTags[erc777ExtraInstance.address] = "Second 777 Address";

			/*
			*	Events:
			*	erc777instance.on('Sent', (from, to, value) => {
			*		console.log(from, 'Sent', value.toString(), 'to', to);
			*	});
			*/
		});

		it ("Should deploy the RAIR Factory", async function() {
			factoryInstance = await FactoryFactory.deploy(tokenPrice, erc777instance.address);
			hre.tracer.nameTags[factoryInstance.address] = "Factory";
		});

		it ("Should deploy the Minter Marketplace", async function() {
			minterInstance = await MinterFactory.deploy(erc777instance.address, rairFeePercentage, nodeFeePercentage);
			hre.tracer.nameTags[minterInstance.address] = "Minter Marketplace";
		});
	})

	// Waiting until the diamond standard is finalized to start using upgradeable contracts
	/*describe('Upgradeable Deployments', function() {
		it ("Factory", async function() {
			*	Normal deployment:
			*	variable = await ContractFactory.deploy(...params);
			*	factoryInstance = await FactoryFactory.deploy(tokenPrice, erc777instance.address);
			*
			*	Upgradeable deployment
			*	variable = await upgrades.deployProxy(ContractFactory, [...params])
			factoryInstance = await upgrades.deployProxy(FactoryFactory, [tokenPrice, erc777instance.address]);
		});

		it ("Minter Marketplace", async function() {
			minterInstance = await upgrades.deployProxy(MinterFactory, [erc777instance.address, 9000, 1000]);
		})
	})*/

	describe('Factory', function() {
		/*describe('Upgrades', function() {
			it ("Should upgrade", async function() {
				let FactoryV2 = await ethers.getContractFactory("RAIR_Token_Factory_V2");
				factoryInstance = await upgrades.upgradeProxy(factoryInstance.address, FactoryV2);
			});
		});*/

		describe('Users', function() {
			it ("Roles should be set up", async function() {
				expect(await factoryInstance.hasRole(await factoryInstance.OWNER(), owner.address)).to.equal(true);
				expect(await factoryInstance.hasRole(await factoryInstance.ERC777(), erc777instance.address)).to.equal(true);
				expect(await factoryInstance.getRoleAdmin(await factoryInstance.ERC777())).to.equal(await factoryInstance.OWNER());
				expect(await factoryInstance.getRoleAdmin(await factoryInstance.OWNER())).to.equal(await factoryInstance.OWNER());
			});

			it ("Only approved ERC777s can send tokens", async function() {
				expect(erc777ExtraInstance.send(factoryInstance.address, tokenPrice, ethers.utils.toUtf8Bytes('')))
					.to.be.revertedWith(`AccessControl: account ${erc777ExtraInstance.address.toLowerCase()} is missing role ${await factoryInstance.ERC777()}`);
				expect(factoryInstance.tokensReceived(owner.address, owner.address, factoryInstance.address, tokenPrice, ethers.utils.toUtf8Bytes(''),  ethers.utils.toUtf8Bytes('')))
					.to.be.revertedWith(`AccessControl: account ${owner.address.toLowerCase()} is missing role ${await factoryInstance.ERC777()}`);
			});
			it ("Reverts if there aren't enough tokens for at least 1 contract", async function() {
				expect(erc777instance.send(factoryInstance.address, tokenPrice - 1, ethers.utils.toUtf8Bytes('')))
					.to.be.revertedWith('RAIR Factory: not enough RAIR tokens to deploy a contract');
			});

			it ("Deploys an ERC721 contract after an ERC777 transfer", async function() {
				// Should return leftover tokens
				await expect(await erc777instance.send(factoryInstance.address, tokenPrice + 1, ethers.utils.toUtf8Bytes(testTokenName)))
					.to.emit(erc777instance, "Sent")
					.to.emit(factoryInstance, 'NewContractDeployed')
					.withArgs(owner.address, 1, firstDeploymentAddress, testTokenName);
				await expect(await erc777instance.balanceOf(owner.address)).to.equal(initialSupply - tokenPrice);
				await expect(await erc777instance.balanceOf(factoryInstance.address)).to.equal(tokenPrice);
			});

			it ("Should track number of token holders", async function() {
				expect(await factoryInstance.getCreatorsCount()).to.equal(1);
			});

			it ("Should store the addresses of the token holders", async function() {
				expect(await factoryInstance.creators(0)).to.equal(owner.address)
			});

			it ("Return the ERC777 price of an NFT", async function() {
				expect(await factoryInstance.deploymentCostForERC777(erc777instance.address)).to.equal(tokenPrice);
			});

			it ("Return the creator's tokens", async function() {
				expect(await factoryInstance.getContractCountOf(owner.address)).to.equal(1);
			});

			it ("Return the token's creator", async function() {
				expect(await factoryInstance.contractToOwner(await factoryInstance.ownerToContracts(owner.address, 0))).to.equal(owner.address);
			});
		});

		describe('Withdrawals', function() {
			it ("Cannot withdraw from tokens without the role", async function() {
				await expect(factoryInstance.withdrawTokens(erc777ExtraInstance.address, tokenPrice)).to.revertedWith("RAIR Factory: Specified contract isn't an approved erc777 contract");
			});

			it ("Cannot withdraw more than the balance", async function() {
				await expect(factoryInstance.withdrawTokens(erc777instance.address, tokenPrice + 1)).to.revertedWith("ERC777: transfer amount exceeds balance");
			});

			it ("Owners should withdraw tokens", async function() {
				expect(await factoryInstance.withdrawTokens(erc777instance.address, tokenPrice)).to.emit(factoryInstance, 'TokensWithdrawn').withArgs(owner.address, erc777instance.address, tokenPrice);
			});
		});

		describe('Owner', function() {
			it ("Only the owner can add ERC777 tokens", async function() {
				let factoryAsAddress1 = factoryInstance.connect(addr1);
				await expect(factoryAsAddress1.grantRole(await factoryInstance.ERC777(), erc777ExtraInstance.address))
					.to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${await factoryInstance.OWNER()}`);
			});

			it ("Add a new ERC777 token", async function() {
				await expect(await factoryInstance.add777Token(erc777ExtraInstance.address, tokenPrice * 2)).to.emit(factoryInstance, 'RoleGranted').to.emit(factoryInstance, 'NewTokensAccepted');
			});

			it ("Mint a token after another ERC777 transfer", async function() {
				await expect(await erc777ExtraInstance.send(factoryInstance.address, tokenPrice * 2, ethers.utils.toUtf8Bytes('')))
					.to.emit(erc777ExtraInstance, "Sent")
					.to.emit(factoryInstance, 'NewContractDeployed')
					.withArgs(owner.address, 2, secondDeploymentAddress, '');
				await expect(await erc777ExtraInstance.balanceOf(owner.address)).to.equal((initialSupply - tokenPrice) * 2);
				await expect(await erc777ExtraInstance.balanceOf(factoryInstance.address)).to.equal(tokenPrice * 2);
				await expect(await factoryInstance.getContractCountOf(owner.address)).to.equal(2);
				await expect(await factoryInstance.contractToOwner(await factoryInstance.ownerToContracts(owner.address, 0))).to.equal(owner.address);
			});

			it ("Only the owner can remove an ERC777 token", async function() {
				let factoryAsAddress1 = factoryInstance.connect(addr1);
				expect(factoryAsAddress1.revokeRole(await factoryInstance.ERC777(), erc777ExtraInstance.address))
					.to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${await factoryInstance.OWNER()}`);
			});

			it ("Remove an ERC777 token", async function() {
				expect(await factoryInstance.remove777Token(erc777ExtraInstance.address)).to.emit(factoryInstance, 'RoleRevoked').to.emit(factoryInstance, 'TokenNoLongerAccepted');
			});

			it ("Only the owner can renounce to his role", async function() {
				let factoryAsAddress1 = factoryInstance.connect(addr1);
				expect(factoryAsAddress1.renounceRole(await factoryInstance.OWNER(), owner.address))
					.to.be.revertedWith(`AccessControl: can only renounce roles for self`);
			});
		});
	})

	describe('RAIR 721', function() {
		describe('Metadata', function() {
			it ("Roles should be set up", async function() {
				rair721Instance = await RAIR721Factory.attach(await factoryInstance.ownerToContracts(owner.address, 0))
				console.log('onwerToContracts ------: ', await factoryInstance.ownerToContracts(owner.address, 1) );
				// console.log(rair721Instance.functions);
				expect(await rair721Instance.hasRole(await rair721Instance.CREATOR(), owner.address)).to.equal(true);
				expect(await rair721Instance.getRoleAdmin(await rair721Instance.MINTER())).to.equal(await rair721Instance.CREATOR());
			});

			it ("Should return factory address", async function() {
				await expect(await rair721Instance.factory()).to.equal(factoryInstance.address);
			});

			it ("Correct creator address", async function() {
				expect(await rair721Instance.getRoleMember(await rair721Instance.CREATOR(), 0)).to.equal(owner.address);
			});

			it ("Correct token name", async function() {
				expect(await rair721Instance.name()).to.equal(testTokenName);
			});

			it ("Correct token symbol", async function() {
				expect(await rair721Instance.symbol()).to.equal("RAIR");
			});

			it ("Only the owner can renounce to his role", async function() {
				let rair721AsAddress1 = rair721Instance.connect(addr1);
				expect(rair721AsAddress1.renounceRole(await rair721Instance.CREATOR(), owner.address))
					.to.be.revertedWith(`AccessControl: can only renounce roles for self`);
			});

			it ("Should know who's the admin role of all roles", async function() {
				await expect(await rair721Instance.getRoleAdmin(await rair721Instance.MINTER())).to.equal(await rair721Instance.CREATOR());
				await expect(await rair721Instance.getRoleAdmin(await rair721Instance.TRADER())).to.equal(await rair721Instance.CREATOR());
				await expect(await rair721Instance.getRoleAdmin(await rair721Instance.CREATOR())).to.equal(await rair721Instance.DEFAULT_ADMIN_ROLE());
			});
		});

		describe('Supply', function() {
			it ("Should display correct initial supply", async function() {
				expect(rair721Instance.ownerOf(1)).to.be.revertedWith('ERC721: owner query for nonexistent token');
			});

			it ("Should not show next index for nonexistent collections", async function() {
				await expect(rair721Instance.getNextSequentialIndex(0, 0, 0)).to.revertedWith("RAIR ERC721: Product does not exist");
			})

			it ("Should create a Product", async function() {
				await expect(await rair721Instance.getProductCount()).to.equal(0);
				await expect(await rair721Instance.createProduct("COLLECTION #1", collection1Limit)).to.emit(rair721Instance, 'ProductCreated').withArgs(0, 'COLLECTION #1', 0, collection1Limit);
				await expect(await rair721Instance.createProduct("COLLECTION #2", collection2Limit)).to.emit(rair721Instance, 'ProductCreated').withArgs(1, 'COLLECTION #2', collection1Limit, collection2Limit);
				await expect(await rair721Instance.createProduct("COLLECTION #3", collection3Limit)).to.emit(rair721Instance, 'ProductCreated').withArgs(2, 'COLLECTION #3', collection2Limit + collection1Limit, collection3Limit);
				await expect(await rair721Instance.createProduct("COLLECTION #4", collection4Limit)).to.emit(rair721Instance, 'ProductCreated').withArgs(3, 'COLLECTION #4', collection3Limit + collection2Limit + collection1Limit, collection4Limit);
				await expect(await rair721Instance.getProductCount()).to.equal(4);
				await expect((await rair721Instance.getProduct(0)).productName).to.equal("COLLECTION #1");
				await expect((await rair721Instance.getProduct(1)).productName).to.equal("COLLECTION #2");
				await expect((await rair721Instance.getProduct(2)).productName).to.equal("COLLECTION #3");
				await expect((await rair721Instance.getProduct(3)).productName).to.equal("COLLECTION #4");
			});

			it ("Should show the next index for collections", async function() {
				expect(await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.equal(0);
				expect(await rair721Instance.getNextSequentialIndex(0, 1, collection1Limit)).to.equal(1);
				expect(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.equal(0);
				expect(await rair721Instance.getNextSequentialIndex(1, 1, collection2Limit)).to.equal(1);
				expect(await rair721Instance.getNextSequentialIndex(2, 0, collection3Limit)).to.equal(0);
				expect(await rair721Instance.getNextSequentialIndex(2, 23, collection3Limit)).to.equal(23);
				expect(await rair721Instance.getNextSequentialIndex(3, 0, collection4Limit)).to.equal(0);
			})

			it ("Shouldn't let unauthorized addresses mint", async function() {
				let rair721AsAddress2 = rair721Instance.connect(addr2);
				let next = await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit);
				expect(next).to.equal(0);
				await expect(rair721AsAddress2.mint(addr3.address, 0, next))
					.to.be.revertedWith(`AccessControl: account ${addr2.address.toLowerCase()} is missing role ${await rair721Instance.MINTER()}`);
				expect(await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.equal(next);
			});

			it ("Authorize a Minter", async function() {
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), addr2.address)).to.equal(false);
				await expect(await rair721Instance.grantRole(await rair721Instance.MINTER(), addr2.address)).to.emit(rair721Instance, 'RoleGranted');
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), addr2.address)).to.equal(true);
				await expect(await rair721Instance.getRoleMemberCount(await rair721Instance.MINTER())).to.equal(2);
			});


			it ("Shouldn't lock ranges with tokens outside the collection's range", async function() {
				await expect(rair721Instance.createRangeLock(0, 0, 2, 2)).to.be.revertedWith('RAIR ERC721: Invalid ending token');
				// Invalid starting token
				await expect(rair721Instance.createRangeLock(0, -1, 1, 2)).to.be.reverted; // Negative number is not allowed but there's no specific revert message for this
				await expect(rair721Instance.createRangeLock(1, 0, 9, 11)).to.be.revertedWith('RAIR ERC721: Invalid number of tokens to lock');
			});

			it ("Should say if a lock can be created", async function() {
				await expect(await rair721Instance.canCreateLock(0, 0, 2)).to.equal(false); // 2 is not part of product 0!
				await expect(await rair721Instance.canCreateLock(0, 0, 1)).to.equal(true);
				await expect(await rair721Instance.canCreateLock(1, 0, 4)).to.equal(true);
				await expect(await rair721Instance.canCreateLock(1, 5, 9)).to.equal(true);
				await expect(await rair721Instance.canCreateLock(2, 0, 169)).to.equal(true);
			})

			it ("Should lock ranges inside collections", async function() {
				// RangeLocked Emits: productIndex, startingToken, endingToken, tokensLocked, productName, lockIndex
				await expect(await rair721Instance.createRangeLock(0, 0, 1, 2)).to.emit(rair721Instance, 'RangeLocked').withArgs(0, 0, 1, 2, 'COLLECTION #1', 0);
				await expect(await rair721Instance.createRangeLock(1, 0, 4, 3)).to.emit(rair721Instance, 'RangeLocked').withArgs(1, 2, 6, 3, 'COLLECTION #2', 1);
				await expect(await rair721Instance.createRangeLock(1, 5, 9, 5)).to.emit(rair721Instance, 'RangeLocked').withArgs(1, 7, 11, 5, 'COLLECTION #2', 2);
				await expect(await rair721Instance.createRangeLock(2, 0, 169, 10)).to.emit(rair721Instance, 'RangeLocked').withArgs(2, 12, 181, 10, 'COLLECTION #3', 3);
			});

			it ("Should say if more locks can be created", async function() {
				await expect(await rair721Instance.canCreateLock(0, 0, 1)).to.equal(false); // Already exists
				await expect(await rair721Instance.canCreateLock(2, 0, 169)).to.equal(false); // Same
				await expect(await rair721Instance.canCreateLock(1, 1, 3)).to.equal(false); // Subset of a lock
				await expect(await rair721Instance.canCreateLock(1, 2, 6)).to.equal(false); // Same
			});

			it("Shouldn't lock ranges with invalid information", async function() {
				await expect(rair721Instance.createRangeLock(0, 0, 1, 1)).to.be.revertedWith("RAIR ERC721: Cannot create lock") // Already exists
				await expect(rair721Instance.createRangeLock(2, 0, 169, 2)).to.be.revertedWith("RAIR ERC721: Cannot create lock") // Same
				await expect(rair721Instance.createRangeLock(1, 1, 3, 1)).to.be.revertedWith("RAIR ERC721: Cannot create lock") // Subset of a lock
				await expect(rair721Instance.createRangeLock(1, 2, 6, 2)).to.be.revertedWith("RAIR ERC721: Cannot create lock") // Same
			})

			it ("Locks - Should give information about token ranges", async function() {
				for await (let item of [
					{range: 0, expected: [0, 1, 2, 0]},
					{range: 1, expected: [0, 4, 3, 1]},
					{range: 2, expected: [5, 9, 5, 1]},
					{range: 3, expected: [0, 169, 10, 2]},
				]) {
					let aux = await rair721Instance.getLockedRange(item.range);
					for await (let internal of [0,1,2,3]) {
						await expect(aux[internal]).to.equal(item.expected[internal]); 
					}
				}
			})

			it ("Should let minters mint tokens", async function() {
				let rair721AsAddress2 = rair721Instance.connect(addr2);

				let next = await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit);
				await expect(next).to.equal(0);
				await expect(await rair721AsAddress2.mint(addr3.address, 0, next)).to.emit(rair721Instance, 'Transfer').withArgs(ethers.constants.AddressZero, addr3.address, next);
				await expect(await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.equal(await next.add(1));
				
				next = await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit);
				await expect(next).to.equal(0);
				await expect(await rair721AsAddress2.mint(addr4.address, 1, next)).to.emit(rair721Instance, 'Transfer').withArgs(ethers.constants.AddressZero, addr4.address, next + 2);
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.equal(await next.add(1));
				
				next = await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit);
				await expect(next).to.equal(1);
				await expect(await rair721AsAddress2.mint(addr3.address, 0, next))
					.to.emit(rair721Instance, 'ProductCompleted')
						.withArgs(0, 'COLLECTION #1')
					.to.emit(rair721Instance, 'RangeUnlocked')
						.withArgs(0, 0, 1);
				await expect(rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.be.revertedWith("RAIR ERC721: There are no available tokens in this range");
				
				next = await rair721Instance.getNextSequentialIndex(2, 0, collection3Limit);
				await expect(next).to.equal(0);
				await expect(await rair721AsAddress2.mint(addr1.address, 2, next)).to.emit(rair721Instance, 'Transfer').withArgs(ethers.constants.AddressZero, addr1.address, 12);
				await expect(await rair721Instance.getNextSequentialIndex(2, 0, collection3Limit)).to.equal(next.add(1));
			});

			it ("Should give information about locked tokens", async function() {
				await expect(await rair721Instance.isTokenLocked(0)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(1)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(2)).to.equal(true);
				await expect(await rair721Instance.isTokenLocked(3)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(4)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(5)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(12)).to.equal(true);
			})

			it ("Minter cannot mint once the collection is complete", async function() {
				await expect(rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.be.revertedWith('RAIR ERC721: There are no available tokens in this range');
				let rair721AsAddress2 = rair721Instance.connect(addr2);
				await expect(rair721AsAddress2.mint(addr3.address, 0, 2)).to.be.revertedWith('RAIR ERC721: Invalid token index');
			});

			it ("Unauthorize a Minter", async function() {
				let rair721AsAddress2 = rair721Instance.connect(addr2);
				expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), addr2.address)).to.equal(true);
				expect(await rair721Instance.revokeRole(await rair721Instance.MINTER(), addr2.address)).to.emit(rair721Instance, 'RoleRevoked');
				expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), addr2.address)).to.equal(false);
				let next = await rair721Instance.getNextSequentialIndex(2, 0, collection3Limit);
				expect(next).to.equal(1);
				expect(rair721AsAddress2.mint(addr3.address, 2, next))
					.to.be.revertedWith(`AccessControl: account ${addr2.address.toLowerCase()} is missing role ${await rair721Instance.MINTER()}`);
			});
		});

	})

})
