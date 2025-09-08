import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  ContractUpgraded,
  DataSetCreated,
  DataSetDeleted,
  DataSetEmpty,
  Initialized,
  NextProvingPeriod,
  OwnershipTransferred,
  PiecesAdded,
  PiecesRemoved,
  PossessionProven,
  PriceOracleFailure,
  ProofFeePaid,
  StorageProviderChanged,
  Upgraded
} from "../generated/PDPVerifier/PDPVerifier"

export function createContractUpgradedEvent(
  version: string,
  implementation: Address
): ContractUpgraded {
  let contractUpgradedEvent = changetype<ContractUpgraded>(newMockEvent())

  contractUpgradedEvent.parameters = new Array()

  contractUpgradedEvent.parameters.push(
    new ethereum.EventParam("version", ethereum.Value.fromString(version))
  )
  contractUpgradedEvent.parameters.push(
    new ethereum.EventParam(
      "implementation",
      ethereum.Value.fromAddress(implementation)
    )
  )

  return contractUpgradedEvent
}

export function createDataSetCreatedEvent(
  setId: BigInt,
  storageProvider: Address
): DataSetCreated {
  let dataSetCreatedEvent = changetype<DataSetCreated>(newMockEvent())

  dataSetCreatedEvent.parameters = new Array()

  dataSetCreatedEvent.parameters.push(
    new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId))
  )
  dataSetCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "storageProvider",
      ethereum.Value.fromAddress(storageProvider)
    )
  )

  return dataSetCreatedEvent
}

export function createDataSetDeletedEvent(
  setId: BigInt,
  deletedLeafCount: BigInt
): DataSetDeleted {
  let dataSetDeletedEvent = changetype<DataSetDeleted>(newMockEvent())

  dataSetDeletedEvent.parameters = new Array()

  dataSetDeletedEvent.parameters.push(
    new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId))
  )
  dataSetDeletedEvent.parameters.push(
    new ethereum.EventParam(
      "deletedLeafCount",
      ethereum.Value.fromUnsignedBigInt(deletedLeafCount)
    )
  )

  return dataSetDeletedEvent
}

export function createDataSetEmptyEvent(setId: BigInt): DataSetEmpty {
  let dataSetEmptyEvent = changetype<DataSetEmpty>(newMockEvent())

  dataSetEmptyEvent.parameters = new Array()

  dataSetEmptyEvent.parameters.push(
    new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId))
  )

  return dataSetEmptyEvent
}

export function createInitializedEvent(version: BigInt): Initialized {
  let initializedEvent = changetype<Initialized>(newMockEvent())

  initializedEvent.parameters = new Array()

  initializedEvent.parameters.push(
    new ethereum.EventParam(
      "version",
      ethereum.Value.fromUnsignedBigInt(version)
    )
  )

  return initializedEvent
}

export function createNextProvingPeriodEvent(
  setId: BigInt,
  challengeEpoch: BigInt,
  leafCount: BigInt
): NextProvingPeriod {
  let nextProvingPeriodEvent = changetype<NextProvingPeriod>(newMockEvent())

  nextProvingPeriodEvent.parameters = new Array()

  nextProvingPeriodEvent.parameters.push(
    new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId))
  )
  nextProvingPeriodEvent.parameters.push(
    new ethereum.EventParam(
      "challengeEpoch",
      ethereum.Value.fromUnsignedBigInt(challengeEpoch)
    )
  )
  nextProvingPeriodEvent.parameters.push(
    new ethereum.EventParam(
      "leafCount",
      ethereum.Value.fromUnsignedBigInt(leafCount)
    )
  )

  return nextProvingPeriodEvent
}

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent =
    changetype<OwnershipTransferred>(newMockEvent())

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createPiecesAddedEvent(
  setId: BigInt,
  pieceIds: Array<BigInt>
): PiecesAdded {
  let piecesAddedEvent = changetype<PiecesAdded>(newMockEvent())

  piecesAddedEvent.parameters = new Array()

  piecesAddedEvent.parameters.push(
    new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId))
  )
  piecesAddedEvent.parameters.push(
    new ethereum.EventParam(
      "pieceIds",
      ethereum.Value.fromUnsignedBigIntArray(pieceIds)
    )
  )

  return piecesAddedEvent
}

export function createPiecesRemovedEvent(
  setId: BigInt,
  pieceIds: Array<BigInt>
): PiecesRemoved {
  let piecesRemovedEvent = changetype<PiecesRemoved>(newMockEvent())

  piecesRemovedEvent.parameters = new Array()

  piecesRemovedEvent.parameters.push(
    new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId))
  )
  piecesRemovedEvent.parameters.push(
    new ethereum.EventParam(
      "pieceIds",
      ethereum.Value.fromUnsignedBigIntArray(pieceIds)
    )
  )

  return piecesRemovedEvent
}

export function createPossessionProvenEvent(
  setId: BigInt,
  challenges: Array<ethereum.Tuple>
): PossessionProven {
  let possessionProvenEvent = changetype<PossessionProven>(newMockEvent())

  possessionProvenEvent.parameters = new Array()

  possessionProvenEvent.parameters.push(
    new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId))
  )
  possessionProvenEvent.parameters.push(
    new ethereum.EventParam(
      "challenges",
      ethereum.Value.fromTupleArray(challenges)
    )
  )

  return possessionProvenEvent
}

export function createPriceOracleFailureEvent(
  reason: Bytes
): PriceOracleFailure {
  let priceOracleFailureEvent = changetype<PriceOracleFailure>(newMockEvent())

  priceOracleFailureEvent.parameters = new Array()

  priceOracleFailureEvent.parameters.push(
    new ethereum.EventParam("reason", ethereum.Value.fromBytes(reason))
  )

  return priceOracleFailureEvent
}

export function createProofFeePaidEvent(
  setId: BigInt,
  fee: BigInt,
  price: BigInt,
  expo: i32
): ProofFeePaid {
  let proofFeePaidEvent = changetype<ProofFeePaid>(newMockEvent())

  proofFeePaidEvent.parameters = new Array()

  proofFeePaidEvent.parameters.push(
    new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId))
  )
  proofFeePaidEvent.parameters.push(
    new ethereum.EventParam("fee", ethereum.Value.fromUnsignedBigInt(fee))
  )
  proofFeePaidEvent.parameters.push(
    new ethereum.EventParam("price", ethereum.Value.fromUnsignedBigInt(price))
  )
  proofFeePaidEvent.parameters.push(
    new ethereum.EventParam("expo", ethereum.Value.fromI32(expo))
  )

  return proofFeePaidEvent
}

export function createStorageProviderChangedEvent(
  setId: BigInt,
  oldStorageProvider: Address,
  newStorageProvider: Address
): StorageProviderChanged {
  let storageProviderChangedEvent =
    changetype<StorageProviderChanged>(newMockEvent())

  storageProviderChangedEvent.parameters = new Array()

  storageProviderChangedEvent.parameters.push(
    new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId))
  )
  storageProviderChangedEvent.parameters.push(
    new ethereum.EventParam(
      "oldStorageProvider",
      ethereum.Value.fromAddress(oldStorageProvider)
    )
  )
  storageProviderChangedEvent.parameters.push(
    new ethereum.EventParam(
      "newStorageProvider",
      ethereum.Value.fromAddress(newStorageProvider)
    )
  )

  return storageProviderChangedEvent
}

export function createUpgradedEvent(implementation: Address): Upgraded {
  let upgradedEvent = changetype<Upgraded>(newMockEvent())

  upgradedEvent.parameters = new Array()

  upgradedEvent.parameters.push(
    new ethereum.EventParam(
      "implementation",
      ethereum.Value.fromAddress(implementation)
    )
  )

  return upgradedEvent
}
