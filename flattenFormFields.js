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

/**
 * 判断扁平化后的字段在当前表单数据下是否应当渲染。
 *
 * 支持两种入参形式：
 *   isFieldVisible(field, formData)                    // 传字段对象
 *   isFieldVisible(fieldKey, formData, flatFields)     // 传 fieldKey + 扁平字段数组
 *
 * 规则：
 * - 没有 visibleWhen 或 visibleWhen 为空 → 始终显示（顶层字段）
 * - 有 visibleWhen → 必须每一条件都满足才显示（链路上的所有祖先都被命中）
 *   命中的判定：
 *     · 表单值是数组（如 checkbox 多选）→ 包含 equals 即算命中
 *     · 表单值是基本类型 → 严格相等（数字与字符串做一次宽松比较兜底）
 *
 * @param {Object|String} fieldOrKey 字段对象，或扁平化后的 fieldKey
 * @param {Object} formData          当前表单数据，键为扁平化后的 fieldKey
 * @param {Array}  [flatFields]      第一参数为 fieldKey 时必传，用于查找字段
 * @returns {Boolean}
 */
function isFieldVisible(fieldOrKey, formData, flatFields) {
  let field = fieldOrKey;
  if (typeof fieldOrKey === 'string') {
    if (!Array.isArray(flatFields)) return false;
    field = flatFields.find((f) => f.fieldKey === fieldOrKey);
  }
  if (!field) return false;

  const conditions = field.visibleWhen;
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  if (!formData) return false;

  return conditions.every((cond) => matchCondition(formData[cond.fieldKey], cond.equals));
}

/**
 * 工厂函数：基于一份扁平字段数组，生成一个 (fieldKey, formData) => Boolean 的判断器。
 * 内部用 Map 缓存 fieldKey → field，循环中调用 O(1) 查找，比每次 find 更划算。
 *
 * @param {Array} flatFields flattenFormFields 的返回值
 * @returns {(fieldKey: String, formData: Object) => Boolean}
 */
function createVisibilityChecker(flatFields) {
  const map = new Map();
  if (Array.isArray(flatFields)) {
    for (const f of flatFields) map.set(f.fieldKey, f);
  }
  return function check(fieldKey, formData) {
    const field = map.get(fieldKey);
    if (!field) return false;
    const conditions = field.visibleWhen;
    if (!Array.isArray(conditions) || conditions.length === 0) return true;
    if (!formData) return false;
    return conditions.every((cond) => matchCondition(formData[cond.fieldKey], cond.equals));
  };
}

function matchCondition(actual, expected) {
  if (Array.isArray(actual)) {
    return actual.some((v) => looseEqual(v, expected));
  }
  return looseEqual(actual, expected);
}

function looseEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { flattenFormFields, isFieldVisible, createVisibilityChecker };
}
