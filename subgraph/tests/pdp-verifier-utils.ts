import { newMockEvent } from 'matchstick-as'
import { ethereum, BigInt, Bytes } from '@graphprotocol/graph-ts'
import {
  PiecesAdded,
  PiecesRemoved,
} from '../generated/PDPVerifier/PDPVerifier'

export function createPiecesAddedEvent(
  setId: BigInt,
  pieceIds: Array<BigInt>,
  pieceCids: Array<Bytes>,
): PiecesAdded {
  const piecesAddedEvent = changetype<PiecesAdded>(newMockEvent())

  piecesAddedEvent.parameters = []

  piecesAddedEvent.parameters.push(
    new ethereum.EventParam('setId', ethereum.Value.fromUnsignedBigInt(setId)),
  )
  piecesAddedEvent.parameters.push(
    new ethereum.EventParam(
      'pieceIds',
      ethereum.Value.fromUnsignedBigIntArray(pieceIds),
    ),
  )

  piecesAddedEvent.parameters.push(
    new ethereum.EventParam(
      'pieceCids',
      ethereum.Value.fromTupleArray(
        pieceCids.map<ethereum.Tuple>((cid) => {
          const tuple = new ethereum.Tuple(1)
          tuple[0] = ethereum.Value.fromBytes(cid)
          return tuple
        }),
      ),
    ),
  )

  return piecesAddedEvent
}

export function createPiecesRemovedEvent(
  setId: BigInt,
  pieceIds: Array<BigInt>,
): PiecesRemoved {
  const piecesRemovedEvent = changetype<PiecesRemoved>(newMockEvent())

  piecesRemovedEvent.parameters = []

  piecesRemovedEvent.parameters.push(
    new ethereum.EventParam('setId', ethereum.Value.fromUnsignedBigInt(setId)),
  )
  piecesRemovedEvent.parameters.push(
    new ethereum.EventParam(
      'pieceIds',
      ethereum.Value.fromUnsignedBigIntArray(pieceIds),
    ),
  )

  return piecesRemovedEvent
}
