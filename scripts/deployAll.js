/*
NATIVE_TOKEN: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  UniswapGmxEthPool: "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E",
*/

const { getFrameSigner, deployContract, sendTxn } = require("./shared/helpers")
const { expandDecimals, maxUint256 } = require("./../test/shared/utilities")
const { toUsd } = require("./../test/shared/units")
const { errors } = require("./../test/core/Vault/helpers")

// const nativeToken = { address: '0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681' }
const timelockAdminAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
const timelockMintReceiverAddress = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'

async function deployAll() {

  const nativeToken = await deployContract('WETH', ["Wrapped Ether", "WETH", 18]);

  /*********************************************/
  /******************* VAULT *******************/
  /*********************************************/

  const vault = await deployContract("Vault", [])
  const usdg = await deployContract("USDG", [vault.address])
  const router = await deployContract("Router", [vault.address, usdg.address, nativeToken.address])

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [])

  await sendTxn(vault.initialize(
    router.address, // router
    usdg.address, // usdg
    vaultPriceFeed.address, // priceFeed
    toUsd(2), // liquidationFeeUsd
    100, // fundingRateFactor
    100 // stableFundingRateFactor
  ), "vault.initialize")

  const btc = await deployContract("FaucetToken", ["Bitcoin", "BTC", 8, expandDecimals(1000, 18)]);
  const btcPriceFeed = await deployContract("PriceFeed", [])
  await sendTxn(await btcPriceFeed.setLatestAnswer(10000 * Math.pow(10, 8)), 'btcPriceFeed.setLatestAnswer: 10000')
  await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
  await vault.setTokenConfig(btc.address, 8, 27000, 0, expandDecimals(50 * 1000 *1000, 18), false, true)
  // await vault.setTokenConfig(token.address, token.decimals, token.tokenWeight, token.minProfitBps, expandDecimals(token.maxUsdgAmount, 18), token.isStable, token.isShortable)

  const wethPriceFeed = await deployContract("PriceFeed", [])
  await sendTxn(await wethPriceFeed.setLatestAnswer(2500 * Math.pow(10, 8)), 'wethPriceFeed.setLatestAnswer: 2500')
  await vaultPriceFeed.setTokenConfig(nativeToken.address, wethPriceFeed.address, 8, false)
  await vault.setTokenConfig(nativeToken.address, 18, 28000, 0, expandDecimals(120 * 1000 * 1000, 18), false, true)

  const usdc = await deployContract("FaucetToken", ["USDC Coin", "USDC", 6, expandDecimals(1000, 18)]);
  const usdcPriceFeed = await deployContract("PriceFeed", [])
  await sendTxn(await usdcPriceFeed.setLatestAnswer(1 * Math.pow(10, 8)), 'usdcPriceFeed.setLatestAnswer: 1')
  await vaultPriceFeed.setTokenConfig(usdc.address, usdcPriceFeed.address, 8, true)
  await vault.setTokenConfig(usdc.address, 6, 32000, 0, expandDecimals(120 * 1000 * 1000, 18), true, false)

  const usdt = await deployContract("FaucetToken", ["Tether", "USDT", 6, expandDecimals(1000, 18)]);
  const usdtPriceFeed = await deployContract("PriceFeed", [])
  await sendTxn(await usdtPriceFeed.setLatestAnswer(1 * Math.pow(10, 8)), 'usdtPriceFeed.setLatestAnswer: 1')
  await vaultPriceFeed.setTokenConfig(usdt.address, usdtPriceFeed.address, 8, true)
  await vault.setTokenConfig(usdt.address, 6, 3000, 0, expandDecimals(10 * 1000 * 1000, 18), true, false)

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")

  const glp = await deployContract("GLP", [])
  await sendTxn(glp.setInPrivateTransferMode(true), "glp.setInPrivateTransferMode")

  const glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, 1 * 60]) // Todo: Change Cooldown back to 15 min

  await sendTxn(glp.setMinter(glpManager.address, true), "glp.setMinter")
  await sendTxn(usdg.addVault(glpManager.address), "usdg.addVault(glpManager)")

  await sendTxn(vault.setFundingRate(60 * 60, 100, 100), "vault.setFundingRate")
  await sendTxn(vault.setInManagerMode(true), "vault.setInManagerMode")
  await sendTxn(vault.setManager(glpManager.address, true), "vault.setManager")

  await sendTxn(vault.setFees(
    50, // _taxBasisPoints
    5, // _stableTaxBasisPoints
    25, // _mintBurnFeeBasisPoints
    30, // _swapFeeBasisPoints
    1, // _stableSwapFeeBasisPoints
    10, // _marginFeeBasisPoints
    toUsd(5), // _liquidationFeeUsd
    0, // _minProfitTime
    false // _hasDynamicFees
  ), "vault.setFees")

  const vaultErrorController = await deployContract("VaultErrorController", [])
  await sendTxn(vault.setErrorController(vaultErrorController.address), "vault.setErrorController")
  await sendTxn(vaultErrorController.setErrors(vault.address, errors), "vaultErrorController.setErrors")

  const vaultUtils = await deployContract("VaultUtils", [vault.address])
  await sendTxn(vault.setVaultUtils(vaultUtils.address), "vault.setVaultUtils")

  const vaultReader = await deployContract("VaultReader", [], "VaultReader")

  /*********************************************/
  /****************** READER *******************/
  /*********************************************/

  const reader = await deployContract("Reader", [], "Reader")

  /*********************************************/
  /******************** GMX ********************/
  /*********************************************/
  const gmx = await deployContract("GMX", [])

  /*********************************************/
  /******************* esGMX *******************/
  /*********************************************/
  const esGmx = await deployContract("EsGMX", [])

  /*********************************************/
  /******************* bnGMX *******************/
  /*********************************************/
  const bnGmx = await deployContract("MintableBaseToken", ["Bonus GMX", "bnGMX", 0]);

  /*********************************************/
  /***************** esGMX IOU *****************/
  /*********************************************/
  const esGMXIOU = await deployContract("MintableBaseToken", ["esGMX IOU", "esGMX:IOU", 0])

  /*********************************************/
  /*************** REWARD READER ***************/
  /*********************************************/

  const rewardReader = await deployContract("RewardReader", [], "RewardReader")

  /*********************************************/
  /*************** REWARD ROUTER ***************/
  /*********************************************/

  const vestingDuration = 365 * 24 * 60 * 60

  await sendTxn(esGmx.setInPrivateTransferMode(true), "esGmx.setInPrivateTransferMode")
  await sendTxn(glp.setInPrivateTransferMode(true), "glp.setInPrivateTransferMode")

  const stakedGmxTracker = await deployContract("RewardTracker", ["Staked GMX", "sGMX"])
  const stakedGmxDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGmxTracker.address])
  await sendTxn(stakedGmxTracker.initialize([gmx.address, esGmx.address], stakedGmxDistributor.address), "stakedGmxTracker.initialize")
  await sendTxn(stakedGmxDistributor.updateLastDistributionTime(), "stakedGmxDistributor.updateLastDistributionTime")

  const bonusGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus GMX", "sbGMX"])
  const bonusGmxDistributor = await deployContract("BonusDistributor", [bnGmx.address, bonusGmxTracker.address])
  await sendTxn(bonusGmxTracker.initialize([stakedGmxTracker.address], bonusGmxDistributor.address), "bonusGmxTracker.initialize")
  await sendTxn(bonusGmxDistributor.updateLastDistributionTime(), "bonusGmxDistributor.updateLastDistributionTime")

  const feeGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee GMX", "sbfGMX"])
  const feeGmxDistributor = await deployContract("RewardDistributor", [nativeToken.address, feeGmxTracker.address])
  await sendTxn(feeGmxTracker.initialize([bonusGmxTracker.address, bnGmx.address], feeGmxDistributor.address), "feeGmxTracker.initialize")
  await sendTxn(feeGmxDistributor.updateLastDistributionTime(), "feeGmxDistributor.updateLastDistributionTime")

  const feeGlpTracker = await deployContract("RewardTracker", ["Fee GLP", "fGLP"])
  const feeGlpDistributor = await deployContract("RewardDistributor", [nativeToken.address, feeGlpTracker.address])
  await sendTxn(feeGlpTracker.initialize([glp.address], feeGlpDistributor.address), "feeGlpTracker.initialize")
  await sendTxn(feeGlpDistributor.updateLastDistributionTime(), "feeGlpDistributor.updateLastDistributionTime")

  const stakedGlpTracker = await deployContract("RewardTracker", ["Fee + Staked GLP", "fsGLP"])
  const stakedGlpDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGlpTracker.address])
  await sendTxn(stakedGlpTracker.initialize([feeGlpTracker.address], stakedGlpDistributor.address), "stakedGlpTracker.initialize")
  await sendTxn(stakedGlpDistributor.updateLastDistributionTime(), "stakedGlpDistributor.updateLastDistributionTime")

  await sendTxn(stakedGmxTracker.setInPrivateTransferMode(true), "stakedGmxTracker.setInPrivateTransferMode")
  await sendTxn(stakedGmxTracker.setInPrivateStakingMode(true), "stakedGmxTracker.setInPrivateStakingMode")
  await sendTxn(bonusGmxTracker.setInPrivateTransferMode(true), "bonusGmxTracker.setInPrivateTransferMode")
  await sendTxn(bonusGmxTracker.setInPrivateStakingMode(true), "bonusGmxTracker.setInPrivateStakingMode")
  await sendTxn(bonusGmxTracker.setInPrivateClaimingMode(true), "bonusGmxTracker.setInPrivateClaimingMode")
  await sendTxn(feeGmxTracker.setInPrivateTransferMode(true), "feeGmxTracker.setInPrivateTransferMode")
  await sendTxn(feeGmxTracker.setInPrivateStakingMode(true), "feeGmxTracker.setInPrivateStakingMode")

  await sendTxn(feeGlpTracker.setInPrivateTransferMode(true), "feeGlpTracker.setInPrivateTransferMode")
  await sendTxn(feeGlpTracker.setInPrivateStakingMode(true), "feeGlpTracker.setInPrivateStakingMode")
  await sendTxn(stakedGlpTracker.setInPrivateTransferMode(true), "stakedGlpTracker.setInPrivateTransferMode")
  await sendTxn(stakedGlpTracker.setInPrivateStakingMode(true), "stakedGlpTracker.setInPrivateStakingMode")

  const gmxVester = await deployContract("Vester", [
    "Vested GMX", // _name
    "vGMX", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    feeGmxTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedGmxTracker.address, // _rewardTracker
  ])

  const glpVester = await deployContract("Vester", [
    "Vested GLP", // _name
    "vGLP", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    stakedGlpTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedGlpTracker.address, // _rewardTracker
  ])

  const rewardRouter = await deployContract("RewardRouterV2", [])
  await sendTxn(rewardRouter.initialize(
    nativeToken.address,
    gmx.address,
    esGmx.address,
    bnGmx.address,
    glp.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    feeGmxTracker.address,
    feeGlpTracker.address,
    stakedGlpTracker.address,
    glpManager.address,
    gmxVester.address,
    glpVester.address
  ), "rewardRouter.initialize")

  await sendTxn(glpManager.setHandler(rewardRouter.address, true), "glpManager.setHandler(rewardRouter)")

  // allow rewardRouter to stake in stakedGmxTracker
  await sendTxn(stakedGmxTracker.setHandler(rewardRouter.address, true), "stakedGmxTracker.setHandler(rewardRouter)")
  // allow bonusGmxTracker to stake stakedGmxTracker
  await sendTxn(stakedGmxTracker.setHandler(bonusGmxTracker.address, true), "stakedGmxTracker.setHandler(bonusGmxTracker)")
  // allow rewardRouter to stake in bonusGmxTracker
  await sendTxn(bonusGmxTracker.setHandler(rewardRouter.address, true), "bonusGmxTracker.setHandler(rewardRouter)")
  // allow bonusGmxTracker to stake feeGmxTracker
  await sendTxn(bonusGmxTracker.setHandler(feeGmxTracker.address, true), "bonusGmxTracker.setHandler(feeGmxTracker)")
  await sendTxn(bonusGmxDistributor.setBonusMultiplier(10000), "bonusGmxDistributor.setBonusMultiplier")
  // allow rewardRouter to stake in feeGmxTracker
  await sendTxn(feeGmxTracker.setHandler(rewardRouter.address, true), "feeGmxTracker.setHandler(rewardRouter)")
  // allow stakedGmxTracker to stake esGmx
  await sendTxn(esGmx.setHandler(stakedGmxTracker.address, true), "esGmx.setHandler(stakedGmxTracker)")
  // allow feeGmxTracker to stake bnGmx
  await sendTxn(bnGmx.setHandler(feeGmxTracker.address, true), "bnGmx.setHandler(feeGmxTracker")
  // allow rewardRouter to burn bnGmx
  await sendTxn(bnGmx.setMinter(rewardRouter.address, true), "bnGmx.setMinter(rewardRouter")

  // allow stakedGlpTracker to stake feeGlpTracker
  await sendTxn(feeGlpTracker.setHandler(stakedGlpTracker.address, true), "feeGlpTracker.setHandler(stakedGlpTracker)")
  // allow feeGlpTracker to stake glp
  await sendTxn(glp.setHandler(feeGlpTracker.address, true), "glp.setHandler(feeGlpTracker)")

  // allow rewardRouter to stake in feeGlpTracker
  await sendTxn(feeGlpTracker.setHandler(rewardRouter.address, true), "feeGlpTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedGlpTracker
  await sendTxn(stakedGlpTracker.setHandler(rewardRouter.address, true), "stakedGlpTracker.setHandler(rewardRouter)")

  await sendTxn(esGmx.setHandler(rewardRouter.address, true), "esGmx.setHandler(rewardRouter)")
  await sendTxn(esGmx.setHandler(stakedGmxDistributor.address, true), "esGmx.setHandler(stakedGmxDistributor)")
  await sendTxn(esGmx.setHandler(stakedGlpDistributor.address, true), "esGmx.setHandler(stakedGlpDistributor)")
  await sendTxn(esGmx.setHandler(stakedGlpTracker.address, true), "esGmx.setHandler(stakedGlpTracker)")
  await sendTxn(esGmx.setHandler(gmxVester.address, true), "esGmx.setHandler(gmxVester)")
  await sendTxn(esGmx.setHandler(glpVester.address, true), "esGmx.setHandler(glpVester)")

  await sendTxn(esGmx.setMinter(gmxVester.address, true), "esGmx.setMinter(gmxVester)")
  await sendTxn(esGmx.setMinter(glpVester.address, true), "esGmx.setMinter(glpVester)")

  await sendTxn(gmxVester.setHandler(rewardRouter.address, true), "gmxVester.setHandler(rewardRouter)")
  await sendTxn(glpVester.setHandler(rewardRouter.address, true), "glpVester.setHandler(rewardRouter)")

  await sendTxn(feeGmxTracker.setHandler(gmxVester.address, true), "feeGmxTracker.setHandler(gmxVester)")
  await sendTxn(stakedGlpTracker.setHandler(glpVester.address, true), "stakedGlpTracker.setHandler(glpVester)")

  /*********************************************/
  /***************** ORDER BOOK ****************/
  /*********************************************/

  const orderBook = await deployContract("OrderBook", []);

  // Arbitrum mainnet addresses
  await sendTxn(orderBook.initialize(
    router.address, // router
    vault.address, // vault
    nativeToken.address, // weth
    usdg.address, // usdg
    "10000000000000000", // 0.01 AVAX
    expandDecimals(10, 30) // min purchase token amount usd
  ), "orderBook.initialize");

  /*********************************************/
  /*************** ORDER EXECUTOR **************/
  /*********************************************/

  const orderExecutor = await deployContract("OrderExecutor", [vault.address, orderBook.address])

  /*********************************************/
  /************* ORDER BOOK READER *************/
  /*********************************************/

  const orderBookReader = await deployContract("OrderBookReader", [])

  /*********************************************/
  /*************** TOKEN MANAGER ***************/
  /*********************************************/

  const tokenManager = await deployContract("TokenManager", [4], "TokenManager")

  const signers = [
    "0x45e48668F090a3eD1C7961421c60Df4E66f693BD", // Dovey
    "0xD7941C4Ca57a511F21853Bbc7FBF8149d5eCb398", // G
    "0x881690382102106b00a99E3dB86056D0fC71eee6", // Han Wen
    "0x2e5d207a4c0f7e7c52f6622dcc6eb44bc0fe1a13", // Krunal Amin
    "0x6091646D0354b03DD1e9697D33A7341d8C93a6F5", // xhiroz
    "0xd6D5a4070C7CFE0b42bE83934Cc21104AbeF1AD5" // Bybit Security Team
  ]

  await sendTxn(tokenManager.initialize(signers), "tokenManager.initialize")

  /*********************************************/
  /************* REFERRAL STORAGE **************/
  /*********************************************/

  const referralStorage = await deployContract("ReferralStorage", [])

  /*********************************************/
  /************** REFERRAL READER **************/
  /*********************************************/

  const referralReader = await deployContract("ReferralReader", [], "ReferralReader")

  /*********************************************/
  /****************** TIMELOCK *****************/
  /*********************************************/

  const signer = await getFrameSigner()

  const rewardManager = { address: ethers.constants.AddressZero }
  const buffer = 24 * 60 * 60
  const maxTokenSupply = expandDecimals("13250000", 18)

  const timelock = await deployContract("Timelock", [
    timelockAdminAddress,
    buffer,
    rewardManager.address,
    tokenManager.address,
    timelockMintReceiverAddress,
    maxTokenSupply,
    10, // marginFeeBasisPoints 0.1%
    10 // maxMarginFeeBasisPoints 0.1%
  ], "Timelock")

  await sendTxn(timelock.setContractHandler(orderExecutor.address, true), "timelock.setContractHandler(orderExecutor)")


  /*********************************************/
  /**************** DEPLOY FARMS ***************/
  /*********************************************/

  // const xgmt = await deployContract("YieldToken", ["xGambit", "xGMT", expandDecimals(100 * 1000, 18)])
  // const gmtUsdgPair = { address: "0xa41e57459f09a126F358E118b693789d088eA8A0" }
  // const gmtUsdgFarm = await deployContract("YieldFarm", ["GMT-USDG Farm", "GMT-USDG:FARM", gmtUsdgPair.address], "gmtUsdgFarm")

  // const xgmtUsdgPair = { address: "0x0b622208fc0691C2486A3AE6B7C875b4A174b317" }
  // const xgmtUsdgFarm = await deployContract("YieldFarm", ["xGMT-USDG Farm", "xGMT-USDG:FARM", xgmtUsdgPair.address], "xgmtUsdgFarm")

  // const usdgYieldTracker = await deployContract("YieldTracker", [usdg.address], "usdgYieldTracker")
  // const usdgRewardDistributor = await deployContract("TimeDistributor", [], "usdgRewardDistributor")

  // await sendTxn(usdg.setYieldTrackers([usdgYieldTracker.address]), "usdg.setYieldTrackers")
  // await sendTxn(usdgYieldTracker.setDistributor(usdgRewardDistributor.address), "usdgYieldTracker.setDistributor")
  // await sendTxn(usdgRewardDistributor.setDistribution([usdgYieldTracker.address], ["0"], [nativeToken.address]), "usdgRewardDistributor.setDistribution")

  // const xgmtYieldTracker = await deployContract("YieldTracker", [xgmt.address], "xgmtYieldTracker")
  // const xgmtRewardDistributor = await deployContract("TimeDistributor", [], "xgmtRewardDistributor")

  // await sendTxn(xgmt.setYieldTrackers([xgmtYieldTracker.address]), "xgmt.setYieldTrackers")
  // await sendTxn(xgmtYieldTracker.setDistributor(xgmtRewardDistributor.address), "xgmtYieldTracker.setDistributor")
  // await sendTxn(xgmtRewardDistributor.setDistribution([xgmtYieldTracker.address], ["0"], [nativeToken.address]), "xgmtRewardDistributor.setDistribution")

  // const gmtUsdgFarmYieldTrackerXgmt = await deployContract("YieldTracker", [gmtUsdgFarm.address], "gmtUsdgFarmYieldTrackerXgmt")
  // const gmtUsdgFarmDistributorXgmt = await deployContract("TimeDistributor", [], "gmtUsdgFarmDistributorXgmt")

  // await sendTxn(gmtUsdgFarmYieldTrackerXgmt.setDistributor(gmtUsdgFarmDistributorXgmt.address), "gmtUsdgFarmYieldTrackerXgmt.setDistributor")
  // await sendTxn(gmtUsdgFarmDistributorXgmt.setDistribution([gmtUsdgFarmYieldTrackerXgmt.address], ["0"], [xgmt.address]), "gmtUsdgFarmDistributorXgmt.setDistribution")

  // const gmtUsdgFarmYieldTrackerWeth = await deployContract("YieldTracker", [gmtUsdgFarm.address], "gmtUsdgFarmYieldTrackerWbnb")
  // const gmtUsdgFarmDistributorWeth = await deployContract("TimeDistributor", [], "gmtUsdgFarmDistributorWbnb")

  // await sendTxn(gmtUsdgFarmYieldTrackerWeth.setDistributor(gmtUsdgFarmDistributorWeth.address), "gmtUsdgFarmYieldTrackerWbnb.setDistributor")
  // await sendTxn(gmtUsdgFarmDistributorWeth.setDistribution([gmtUsdgFarmYieldTrackerWeth.address], ["0"], [nativeToken.address]), "gmtUsdgFarmDistributorWbnb.setDistribution")

  // await sendTxn(gmtUsdgFarm.setYieldTrackers([gmtUsdgFarmYieldTrackerXgmt.address, gmtUsdgFarmYieldTrackerWeth.address]), "gmtUsdgFarm.setYieldTrackers")

  // const xgmtUsdgFarmYieldTrackerXgmt = await deployContract("YieldTracker", [xgmtUsdgFarm.address], "xgmtUsdgFarmYieldTrackerXgmt")
  // const xgmtUsdgFarmDistributorXgmt = await deployContract("TimeDistributor", [], "xgmtUsdgFarmDistributorXgmt")

  // await sendTxn(xgmtUsdgFarmYieldTrackerXgmt.setDistributor(xgmtUsdgFarmDistributorXgmt.address), "xgmtUsdgFarmYieldTrackerXgmt.setDistributor")
  // await sendTxn(xgmtUsdgFarmDistributorXgmt.setDistribution([xgmtUsdgFarmYieldTrackerXgmt.address], ["0"], [xgmt.address]), "xgmtUsdgFarmDistributorXgmt.setDistribution")

  // const xgmtUsdgFarmYieldTrackerWeth = await deployContract("YieldTracker", [xgmtUsdgFarm.address], "xgmtUsdgFarmYieldTrackerWbnb")
  // const xgmtUsdgFarmDistributorWeth = await deployContract("TimeDistributor", [], "xgmtUsdgFarmDistributorWbnb")

  // await sendTxn(xgmtUsdgFarmYieldTrackerWeth.setDistributor(xgmtUsdgFarmDistributorWeth.address), "xgmtUsdgFarmYieldTrackerWbnb.setDistributor")
  // await sendTxn(xgmtUsdgFarmDistributorWeth.setDistribution([xgmtUsdgFarmYieldTrackerWeth.address], ["0"], [nativeToken.address]), "gmtUsdgFarmDistributorWbnb.setDistribution")

  // await sendTxn(xgmtUsdgFarm.setYieldTrackers([xgmtUsdgFarmYieldTrackerXgmt.address, xgmtUsdgFarmYieldTrackerWeth.address]), "xgmtUsdgFarm.setYieldTrackers")

  /*********************************************/
  /************** POSITION ROUTER **************/
  /*********************************************/

  const depositFee = "30" // 0.3%
  const minExecutionFee = "300000000000000" // 0.0003 ETH

  const positionRouter = await deployContract("PositionRouter", [vault.address, router.address, nativeToken.address, depositFee, minExecutionFee], "PositionRouter")

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")

  /*********************************************/
  /************** POSITION MANAGER *************/
  /*********************************************/

  const orderKeeper = { address: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" }
  const liquidator = { address: "0x90f79bf6eb2c4f870365e785982e1f101e93b906" }

  const partnerContracts = [
    "0xC8d6d21995E00e17c5aaF07bBCde43f0ccd12725", // Jones ETH Hedging
    "0xe36fA7dC99658C9B7E247471261b65A88077D349", // Jones gOHM Hedging
    "0xB9bd050747357ce1fF4eFD314012ca94C07543E6", // Jones DPX Hedging
    "0xe98f68F3380c990D3045B4ae29f3BCa0F3D02939", // Jones rDPX Hedging
  ]

  const positionManager = await deployContract("PositionManager", [vault.address, router.address, nativeToken.address, depositFee, orderBook.address])
  await sendTxn(positionManager.setOrderKeeper(orderKeeper.address, true), "positionManager.setOrderKeeper(orderKeeper)")
  await sendTxn(positionManager.setLiquidator(liquidator.address, true), "positionManager.setLiquidator(liquidator)")
  await sendTxn(timelock.setContractHandler(positionManager.address, true), "timelock.setContractHandler(positionRouter)")
  // await sendTxn(timelock.setLiquidator(vault.address, positionManager.address, true), "timelock.setLiquidator(vault, positionManager, true)")
  await sendTxn(router.addPlugin(positionManager.address), "router.addPlugin(positionManager)")

  for (let i = 0; i < partnerContracts.length; i++) {
    const partnerContract = partnerContracts[i]
    await sendTxn(positionManager.setPartner(partnerContract, true), "positionManager.setPartner(partnerContract)")
  }

  /*********************************************/
  /***************** MINT TOKENS ***************/
  /*********************************************/

  await sendTxn(await btc.mint(timelockAdminAddress, expandDecimals(100, 8)), 'btc.mint')
  await sendTxn(await nativeToken.mint(timelockAdminAddress, expandDecimals(50, 18)), 'nativeToken.mint')
  await sendTxn(await usdc.mint(timelockAdminAddress, expandDecimals(5000, 6)), 'usdc.mint')
  await sendTxn(await usdt.mint(timelockAdminAddress, expandDecimals(10000, 6)), 'usdt.mint')

  /*********************************************/
  /**************** ADD LIQUIDITY **************/
  /*********************************************/

  await sendTxn(await btc.approve(glpManager.address, maxUint256), 'btc.approve')
  await sendTxn(await rewardRouter.mintAndStakeGlp(btc.address, expandDecimals(100, 8), 0, 0), "rewardRouter.mintAndStakeGlpETH: btc")

  await sendTxn(await nativeToken.approve(glpManager.address, maxUint256), 'weth.approve')
  await sendTxn(await rewardRouter.mintAndStakeGlp(nativeToken.address, expandDecimals(50, 18), 0, 0), "rewardRouter.mintAndStakeGlpETH: weth")

  await sendTxn(await usdc.approve(glpManager.address, maxUint256), 'usdc.approve')
  await sendTxn(await rewardRouter.mintAndStakeGlp(usdc.address, expandDecimals(5000, 6), 0, 0), "rewardRouter.mintAndStakeGlpETH: usdc")

  await sendTxn(await usdt.approve(glpManager.address, maxUint256), 'usdt.approve')
  await sendTxn(await rewardRouter.mintAndStakeGlp(usdt.address, expandDecimals(5000, 6), 0, 0), "rewardRouter.mintAndStakeGlpETH: usdt")

  await sendTxn(await glpManager.setInPrivateMode(true), 'glpManager.setInPrivateMode(true)')

  /*********************************************/
  /******************* TOKENS ******************/
  /*********************************************/

  console.log('Tokens:');
  console.log();
  console.log(`BTC: "${btc.address}"`);
  // console.log(`ETH: "${eth.address}"`);
  console.log(`WETH: "${nativeToken.address}"`);
  console.log(`USDC: "${usdc.address}"`);
  console.log(`USDT: "${usdt.address}"`);
  console.log();

  /*********************************************/
  /****************** ADDRESSES ****************/
  /*********************************************/

  console.log('Addresses:');
  console.log();
  console.log(`Router: "${router.address}",`);
  console.log(`Vault: "${vault.address}",`);
  console.log(`VaultReader: "${vaultReader.address}",`);
  console.log(`Reader: "${reader.address}",`);
  console.log(`GlpManager: "${glpManager.address}",`);
  console.log(`RewardRouter: "${rewardRouter.address}",`);
  console.log(`RewardReader: "${rewardReader.address}",`);
  console.log(`NATIVE_TOKEN: "${nativeToken.address}",`);
  console.log(`GLP: "${glp.address}",`);
  console.log(`GMX: "${gmx.address}",`);
  console.log(`ES_GMX: "${esGmx.address}",`);
  console.log(`BN_GMX: "${bnGmx.address}",`);
  console.log(`USDG: "${usdg.address}",`);
  console.log(`ES_GMX_IOU: "${esGMXIOU.address}",`);
  console.log(`StakedGmxTracker: "${stakedGmxTracker.address}",`);
  console.log(`BonusGmxTracker: "${bonusGmxTracker.address}",`);
  console.log(`FeeGmxTracker: "${feeGmxTracker.address}",`);
  console.log(`StakedGlpTracker: "${stakedGlpTracker.address}",`);
  console.log(`FeeGlpTracker: "${feeGlpTracker.address}",`);
  console.log();
  console.log(`StakedGmxDistributor: "${stakedGmxDistributor.address}",`);
  console.log(`StakedGlpDistributor: "${stakedGlpDistributor.address}",`);
  console.log();
  console.log(`GmxVester: "${gmxVester.address}",`);
  console.log(`GlpVester: "${glpVester.address}",`);
  console.log();
  console.log(`OrderBook: "${orderBook.address}",`);
  console.log(`OrderBookReader: "${orderBookReader.address}",`);
  console.log();
  console.log(`PositionRouter: "${positionRouter.address}",`);
  console.log(`PositionManager: "${positionManager.address}",`);
  console.log();
  console.log(`UniswapGmxEthPool: "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E",`);
  console.log(`ReferralStorage: "${referralStorage.address}",`);
  console.log(`ReferralReader: "${referralReader.address}",`);
}

deployAll()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
