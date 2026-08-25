import type { ItemRecord } from '../types/index.js';
import { resolveIterable } from 'driftjs-shared';

function getSequence(arr: Int32Array): number[] {
  const p = new Int32Array(arr.length);
  const result: number[] = [];
  let u: number, v: number, c: number;
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    const arrI = arr[i]!;
    if (arrI !== -1) {
      if (result.length === 0 || arr[result[result.length - 1]!]! < arrI) {
        p[i] = result.length > 0 ? result[result.length - 1]! : -1;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = (u + v) >> 1;
        if (arr[result[c]!]! < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]!]!) {
        if (u > 0) {
          p[i] = result[u - 1]!;
        }
        result[u] = i;
      }
    }
  }
  let uLen = result.length;
  if (uLen === 0) return [];
  let vIdx = result[uLen - 1]!;
  while (uLen-- > 0) {
    result[uLen] = vIdx;
    vIdx = p[vIdx]!;
  }
  return result;
}

function findNextNode(startIndex: number, cache: ItemRecord[], len: number, anchor: Node): Node {
  for (let idx = startIndex; idx < len; idx++) {
    const rec = cache[idx];
    if (rec && rec.nodes && rec.nodes.length > 0) {
      for (let nIdx = 0; nIdx < rec.nodes.length; nIdx++) {
        const n = rec.nodes[nIdx];
        if (n) return n;
      }
    }
  }
  return anchor;
}

/**
 * Keyed list LIS reconciler for DriftJS sub-modules.
 * Minimises DOM insertions, deletions, and moves across array mutations.
 */
export function reconcileKeyedList(
  parent: Node,
  anchor: Node,
  cacheRef: { cache: ItemRecord[] },
  list: unknown[],
  getKey: (item: unknown, index: number) => unknown,
  createItem: (item: unknown, index: number, refNode: Node) => ItemRecord,
  updateItem: (record: ItemRecord, item: unknown, index: number) => void,
  removeItem?: (record: ItemRecord) => void
): void {
  const removeRecordNodes = (rec: ItemRecord) => {
    if (removeItem) {
      try {
        removeItem(rec);
      } catch (e) {
        console.error('[DriftDOM] Error in removeItem cleanup handler:', e);
      }
    }
    for (let nIdx = 0; nIdx < rec.nodes.length; nIdx++) {
      const n = rec.nodes[nIdx];
      if (n && n.parentNode) {
        n.parentNode.removeChild(n);
      }
    }
  };

  const oldCache: ItemRecord[] = cacheRef.cache;
  const newCache: ItemRecord[] = [];
  const newKeySet = new Set<unknown>();

  const safeList = resolveIterable(list);

  for (let i = 0; i < safeList.length; i++) {
    const itemVal = safeList[i];
    const indexVal = i;
    const rawKeyVal = getKey(itemVal, indexVal);
    const baseKey = rawKeyVal !== null && rawKeyVal !== undefined ? rawKeyVal : indexVal;
    let keyVal = baseKey;
    let dupIdx = 0;
    while (newKeySet.has(keyVal)) {
      dupIdx++;
      keyVal = String(baseKey) + '__dup_' + dupIdx;
    }
    newKeySet.add(keyVal);
    newCache.push({ key: keyVal, nodes: [], childRegions: [], itemVal, indexVal });
  }

  const oldLen = oldCache.length;
  const newLen = newCache.length;
  let i = 0;
  let oldEnd = oldLen - 1;
  let newEnd = newLen - 1;

  // 1. Sync prefix
  while (i <= oldEnd && i <= newEnd && oldCache[i]!.key === newCache[i]!.key) {
    const oldRec = oldCache[i]!;
    const newItem = newCache[i]!;
    updateItem(oldRec, newItem.itemVal, newItem.indexVal);
    newCache[i] = oldRec;
    i++;
  }

  // 2. Sync suffix
  while (i <= oldEnd && i <= newEnd && oldCache[oldEnd]!.key === newCache[newEnd]!.key) {
    const oldRec = oldCache[oldEnd]!;
    const newItem = newCache[newEnd]!;
    updateItem(oldRec, newItem.itemVal, newItem.indexVal);
    newCache[newEnd] = oldRec;
    oldEnd--;
    newEnd--;
  }

  // 3. Pure additions
  if (i > oldEnd) {
    if (i <= newEnd) {
      const refNode = findNextNode(newEnd + 1, newCache, newLen, anchor);
      for (let k = i; k <= newEnd; k++) {
        const newItem = newCache[k]!;
        const itemRecord = createItem(newItem.itemVal, newItem.indexVal, refNode);
        itemRecord.key = newItem.key;
        newCache[k] = itemRecord;
      }
    }
  }
  // 4. Pure deletions
  else if (i > newEnd) {
    for (let k = i; k <= oldEnd; k++) {
      removeRecordNodes(oldCache[k]!);
    }
  }
  // 5. Complex keyed reconciliation with LIS
  else {
    const s1 = i;
    const e1 = newEnd;
    const s2 = i;
    const e2 = oldEnd;

    const keyToNewIndexMap = new Map<unknown, number>();
    for (let k = s1; k <= e1; k++) {
      keyToNewIndexMap.set(newCache[k]!.key, k);
    }

    const unhandledNewCount = e1 - s1 + 1;
    const sources = new Int32Array(unhandledNewCount);
    sources.fill(-1);

    let patched = 0;
    let moved = false;
    let maxIndexSoFar = 0;

    for (let k = s2; k <= e2; k++) {
      const oldRec = oldCache[k]!;
      const newIndex = keyToNewIndexMap.get(oldRec.key);
      if (newIndex === undefined) {
        removeRecordNodes(oldRec);
      } else {
        const newIndexInSources = newIndex - s1;
        sources[newIndexInSources] = k;
        if (newIndex >= maxIndexSoFar) {
          maxIndexSoFar = newIndex;
        } else {
          moved = true;
        }
        const newItem = newCache[newIndex]!;
        updateItem(oldRec, newItem.itemVal, newItem.indexVal);
        newCache[newIndex] = oldRec;
        patched++;
      }
    }

    const lis = moved ? getSequence(sources) : [];
    let lisIdx = lis.length - 1;

    for (let j = unhandledNewCount - 1; j >= 0; j--) {
      const newIndex = s1 + j;
      const newItem = newCache[newIndex]!;
      const refNode = findNextNode(newIndex + 1, newCache, newLen, anchor);

      if (sources[j] === -1) {
        const itemRecord = createItem(newItem.itemVal, newItem.indexVal, refNode);
        itemRecord.key = newItem.key;
        newCache[newIndex] = itemRecord;
      } else if (moved) {
        if (lisIdx < 0 || j !== lis[lisIdx]) {
          const itemRecord = newCache[newIndex]!;
          for (let nIdx = 0; nIdx < itemRecord.nodes.length; nIdx++) {
            const n = itemRecord.nodes[nIdx];
            if (n) {
              if (refNode && refNode.parentNode) {
                refNode.parentNode.insertBefore(n, refNode);
              } else if (parent && typeof (parent as any).insertBefore === 'function') {
                (parent as any).insertBefore(n, null);
              }
            }
          }
        } else {
          lisIdx--;
        }
      }
    }
  }

  cacheRef.cache = newCache;
}
