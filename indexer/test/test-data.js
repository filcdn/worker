// Hard-coded to a ProofSet & Root that existed at the time of writing this test.
// In the future, we may need to update these values if the test starts failing.
// A better solution is to discover a live root, but that's beyond M1.
const LIVE_PIECE = {
  dataSetId: 126n,
  id: 0n,
  cid: 'baga6ea4seaqdmmx3vq7bf3oq3cxkwwh5ns5tk7cfhxuisa2qkmtdlpkpi3op2pq',
}

const DELETED_PIECE = {
  dataSetId: 48n,
  id: 0n,
  cid: null,
}

export const PDP_FILES_BY_DATA_SET_ID = {
  [LIVE_PIECE.dataSetId]: LIVE_PIECE,
  [DELETED_PIECE.dataSetId]: DELETED_PIECE,
}
