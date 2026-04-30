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
 * 判断顺序：
 * 1. 若传入 expectedType，先校验类型是否匹配，不匹配直接返回 false。
 *    expectedType 支持以下形式（可单个，也可数组传多个）：
 *      · 普通类型字符串：'radio' / 'checkbox' / 'input' / 'textarea' / 'attach' / 'tree_radio'
 *        → 仅校验 field.fieldType === expectedType
 *      · datetime 子类型字符串：'date' / 'time' / 'datetime'
 *        → 要求 field.fieldType === 'datetime' 且 field.dateTimeMode === expectedType
 *      · 对象：{ type, mode? }
 *        → field.fieldType === type，并且 mode 存在时 field.dateTimeMode === mode
 * 2. 没有 visibleWhen 或 visibleWhen 为空 → 始终显示（顶层字段）。
 * 3. 有 visibleWhen → 链路上每个祖先条件都命中才显示。
 *    命中规则：
 *     · 表单值是数组（如 checkbox 多选）→ 包含 equals 即算命中
 *     · 表单值是基本类型 → 严格相等（数字与字符串做一次宽松比较兜底）
 *
 * @param {Object} field    flattenFormFields 输出的单个字段
 * @param {Object} formData 当前表单数据，键为扁平化后的 fieldKey
 * @param {String|Object|Array} [expectedType] 期望的类型；不传则跳过类型校验
 * @returns {Boolean}
 */
function isFieldVisible(field, formData, expectedType) {
  if (!field) return false;

  if (expectedType != null) {
    const types = Array.isArray(expectedType) ? expectedType : [expectedType];
    if (!types.some((t) => matchFieldType(field, t))) return false;
  }

  const conditions = field.visibleWhen;
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  if (!formData) return false;

  return conditions.every((cond) => matchCondition(formData[cond.fieldKey], cond.equals));
}

const DATETIME_MODES = ['date', 'time', 'datetime'];

function matchFieldType(field, expected) {
  if (expected && typeof expected === 'object') {
    if (expected.type !== field.fieldType) return false;
    if (expected.mode != null && field.dateTimeMode !== expected.mode) return false;
    return true;
  }
  if (DATETIME_MODES.includes(expected)) {
    return field.fieldType === 'datetime' && field.dateTimeMode === expected;
  }
  return field.fieldType === expected;
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
  module.exports = { flattenFormFields, isFieldVisible };
}
