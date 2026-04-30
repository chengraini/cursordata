/**
 * 将带有多层 valueFormMap → linkForm → fields 嵌套的表单配置
 * 扁平化为单层数组，便于循环渲染。
 *
 * 处理要点：
 * 1. 多层嵌套 → 一层数组
 * 2. fieldKey 唯一：子字段使用 "父fieldKey.子fieldKey" 的形式拼接
 * 3. 按 sortOrder 排序，且保证子字段紧跟在父字段后面
 * 4. 为每个被展开的子字段挂上 visibleWhen 条件，
 *    用于前端按"父字段选了某个值"时进行联动显隐
 *
 * @param {Array|String} fields 原始 fields 数组或其 JSON 字符串
 * @returns {Array} 扁平化后的字段数组
 */
function flattenFormFields(fields) {
  const source = typeof fields === 'string' ? JSON.parse(fields) : fields;
  if (!Array.isArray(source)) return [];

  const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

  /**
   * @param {Array} list      当前层级的 fields
   * @param {String} keyPrefix 父级 fieldKey 累积出的前缀（用于保证唯一）
   * @param {Number} depth     嵌套层级（0 = 顶层）
   * @param {Array}  parentChain 祖先字段链，元素为 { fieldKey, dictValue }
   */
  function walk(list, keyPrefix, depth, parentChain) {
    const result = [];
    const sorted = [...list].sort(bySort);

    for (const field of sorted) {
      const uniqueKey = keyPrefix
        ? `${keyPrefix}.${field.fieldKey}`
        : field.fieldKey;

      const { valueFormMap, ...rest } = field;

      const flatField = {
        ...rest,
        fieldKey: uniqueKey,
        originalFieldKey: field.fieldKey,
        depth,
      };

      if (parentChain.length > 0) {
        flatField.parentFieldKey = parentChain[parentChain.length - 1].fieldKey;
        flatField.visibleWhen = parentChain.map((p) => ({
          fieldKey: p.fieldKey,
          equals: p.dictValue,
        }));
      }

      result.push(flatField);

      if (Array.isArray(valueFormMap) && valueFormMap.length > 0) {
        for (const mapItem of valueFormMap) {
          const subFields = mapItem?.linkForm?.fields;
          if (!Array.isArray(subFields) || subFields.length === 0) continue;

          const childChain = [
            ...parentChain,
            { fieldKey: uniqueKey, dictValue: mapItem.dictValue },
          ];

          const children = walk(subFields, uniqueKey, depth + 1, childChain);
          result.push(...children);
        }
      }
    }

    return result;
  }

  return walk(source, '', 0, []);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { flattenFormFields };
}
