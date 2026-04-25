/**
 * Extract plain text from a TipTap / ProseMirror doc JSON (type: 'doc').
 */
function extractTextFromNode(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map((child) => extractTextFromNode(child)).join(' ');
  }
  return '';
}

export function extractTextFromTipTapDoc(blocks) {
  if (!blocks || typeof blocks !== 'object' || blocks.type !== 'doc') return '';
  return extractTextFromNode(blocks).replace(/\s+/g, ' ').trim();
}

/**
 * @param {object|null|undefined} blocks
 * @param {string|undefined} content Legacy plain text
 */
export function buildSearchText(blocks, content) {
  if (blocks && typeof blocks === 'object' && blocks.type === 'doc') {
    return extractTextFromTipTapDoc(blocks);
  }
  return (content && String(content)) ? String(content).replace(/\s+/g, ' ').trim() : '';
}

export const MAX_BLOCKS_JSON_BYTES = 1_200_000;

export function blocksPayloadByteLength(blocks) {
  if (blocks == null) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(blocks), 'utf8');
  } catch {
    return MAX_BLOCKS_JSON_BYTES + 1;
  }
}

/** Aligned with TipTap / StarterKit + tables + task list + code blocks in the app */
const ALLOWED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'bulletList',
  'orderedList',
  'listItem',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'taskList',
  'taskItem',
  'image',
]);

const MAX_DOC_DEPTH = 48;
const MAX_MARK_TYPE_LEN = 40;

function validateMarks(marks) {
  if (!Array.isArray(marks)) return false;
  for (const m of marks) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
    if (typeof m.type !== 'string' || m.type.length < 1 || m.type.length > MAX_MARK_TYPE_LEN) return false;
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(m.type)) return false;
  }
  return true;
}

function validateProseNode(node, depth) {
  if (depth > MAX_DOC_DEPTH) return false;
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return false;
  if (typeof node.type !== 'string' || !ALLOWED_NODE_TYPES.has(node.type)) return false;
  if (node.type === 'text') {
    if (node.text != null && typeof node.text !== 'string') return false;
    if (node.marks !== undefined && !validateMarks(node.marks)) return false;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (!validateProseNode(child, depth + 1)) return false;
    }
  }
  return true;
}

export function isValidDocBlocks(blocks) {
  if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks) || blocks.type !== 'doc') {
    return false;
  }
  return validateProseNode(blocks, 0);
}
