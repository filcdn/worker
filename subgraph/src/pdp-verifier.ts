import {
  // ethereum,
  // JSONValue,
  // TypedMap,
  // Entity,
  // Bytes,
  // Address,
  BigInt,
} from '@graphprotocol/graph-ts'
import {
  PiecesAdded as PiecesAddedEvent,
  PiecesAddedPieceCidsStruct,
  PiecesRemoved as PiecesRemovedEvent,
} from '../generated/PDPVerifier/PDPVerifier'
import { PiecesAdded, PiecesRemoved } from '../generated/schema'

export function handlePiecesAdded(event: PiecesAddedEvent): void {
  const entity = new PiecesAdded(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.setId = event.params.setId.toString()
  entity.pieceIds = event.params.pieceIds.map<string>((id) => id.toString())
  entity.pieceCids = event.params.pieceCids.map<string>(
    (cidStruct: PiecesAddedPieceCidsStruct) => cidStruct.data.toHexString(),
  )

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handlePiecesRemoved(event: PiecesRemovedEvent): void {
  const entity = new PiecesRemoved(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.setId = event.params.setId.toString()
  entity.pieceIds = event.params.pieceIds.map<string>((id) => id.toString())

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
