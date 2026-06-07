import Note from '../models/Note.js';
import { buildSearchText } from '../utils/noteText.js';

/**
 * One-time / startup backfill: `searchText` is denormalized for search. Older notes may lack it.
 */
export async function backfillNoteSearchText() {
  const filter = { $or: [{ searchText: { $exists: false } }, { searchText: null }] };
  const count = await Note.countDocuments(filter);
  if (count === 0) return;
  // eslint-disable-next-line no-console
  console.log(`[notes] Backfilling searchText for ${count} note(s)...`);

  for (;;) {
    const notes = await Note.find(filter).limit(200).lean();
    if (notes.length === 0) break;
    await Promise.all(
      notes.map((n) =>
        Note.updateOne({ _id: n._id }, { $set: { searchText: buildSearchText(n.blocks, n.content) } })
      )
    );
  }
  // eslint-disable-next-line no-console
  console.log('[notes] searchText backfill done.');
}
