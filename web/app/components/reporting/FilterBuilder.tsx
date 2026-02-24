"use client";

import type { ReportGroup, ReportCondition, FieldMetadata } from "../../lib/reporting-types";
import { QUICK_TEMPLATES } from "../../lib/reporting-types";

const STRING_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "exists", label: "exists" },
  { value: "not_exists", label: "not exists" },
];
const NUMBER_OPERATORS = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "!=" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "between", label: "between" },
  { value: "in_list", label: "in list" },
  { value: "not_in_list", label: "not in list" },
];
const BOOLEAN_OPERATORS = [
  { value: "is_true", label: "is true" },
  { value: "is_false", label: "is false" },
];
const DATE_OPERATORS = [
  { value: "after", label: "after" },
  { value: "before", label: "before" },
  { value: "between", label: "between" },
  { value: "last_n_days", label: "last N days" },
];

function operatorsForField(field: FieldMetadata | undefined) {
  if (!field) return STRING_OPERATORS;
  switch (field.type) {
    case "number":
      return NUMBER_OPERATORS;
    case "boolean":
      return BOOLEAN_OPERATORS;
    case "date":
      return DATE_OPERATORS;
    default:
      return STRING_OPERATORS;
  }
}

function needsValue(op: string): boolean {
  return !["exists", "not_exists", "is_true", "is_false"].includes(op);
}

function querySummary(group: ReportGroup, fields: FieldMetadata[]): string {
  const getLabel = (key: string) => fields.find((f) => f.key === key)?.label || key;
  const parts: string[] = [];
  for (const c of group.children || []) {
    if ("field" in c) {
      const cond = c as ReportCondition;
      const label = getLabel(cond.field);
      if (["exists", "not_exists"].includes(cond.operator)) {
        parts.push(`${label} ${cond.operator === "exists" ? "exists" : "does not exist"}`);
      } else if (["is_true", "is_false"].includes(cond.operator)) {
        parts.push(`${label} is ${cond.operator === "is_true" ? "true" : "false"}`);
      } else if (cond.value != null && cond.value !== "") {
        const val = Array.isArray(cond.value) ? cond.value.join(", ") : String(cond.value);
        parts.push(`${label} ${cond.operator} ${val}`);
      } else {
        parts.push(`${label} ${cond.operator}`);
      }
    } else {
      parts.push(`(${querySummary(c as ReportGroup, fields)})`);
    }
  }
  const joiner = group.op === "AND" ? " and " : " or ";
  return parts.join(joiner);
}

type Props = {
  filter: ReportGroup | null;
  onChange: (filter: ReportGroup | null) => void;
  fields: FieldMetadata[];
};

function ConditionRow({
  condition,
  onChange,
  onRemove,
  fields,
}: {
  condition: ReportCondition;
  onChange: (c: ReportCondition) => void;
  onRemove: () => void;
  fields: FieldMetadata[];
}) {
  const fieldMeta = fields.find((f) => f.key === condition.field);
  const ops = operatorsForField(fieldMeta);
  const showValue = needsValue(condition.operator);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        style={{ padding: "6px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)", minWidth: 120 }}
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>{f.label || f.key}</option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        style={{ padding: "6px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)", minWidth: 100 }}
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {showValue && (
        <input
          type="text"
          value={Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value ?? "")}
          onChange={(e) => {
            const v = e.target.value;
            if (condition.operator === "in_list" || condition.operator === "not_in_list") {
              const nums = v.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
              onChange({ ...condition, value: nums.length ? nums : undefined });
            } else if (fieldMeta?.type === "number") {
              const n = parseInt(v, 10);
              onChange({ ...condition, value: Number.isNaN(n) ? undefined : n });
            } else {
              onChange({ ...condition, value: v || undefined });
            }
          }}
          placeholder="Value"
          style={{ padding: "6px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)", width: 120 }}
        />
      )}
      <button type="button" className="theme-btn theme-btn-ghost" style={{ padding: "2px 6px", fontSize: 12 }} onClick={onRemove}>×</button>
    </div>
  );
}

function GroupEditor({
  group,
  onChange,
  onRemove,
  fields,
  depth,
}: {
  group: ReportGroup;
  onChange: (g: ReportGroup) => void;
  onRemove?: () => void;
  fields: FieldMetadata[];
  depth: number;
}) {
  const addCondition = () => {
    const firstField = fields[0]?.key ?? "host_ip";
    onChange({
      ...group,
      children: [...(group.children || []), { field: firstField, operator: "equals", value: "" }],
    });
  };
  const addGroup = () => {
    onChange({
      ...group,
      children: [...(group.children || []), { op: "AND", children: [] }],
    });
  };
  const updateChild = (index: number, child: ReportCondition | ReportGroup) => {
    const next = [...(group.children || [])];
    next[index] = child;
    onChange({ ...group, children: next });
  };
  const removeChild = (index: number) => {
    const next = (group.children || []).filter((_, i) => i !== index);
    onChange({ ...group, children: next });
  };

  return (
    <div style={{ marginLeft: depth * 16, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <select
          value={group.op}
          onChange={(e) => onChange({ ...group, op: e.target.value as "AND" | "OR" })}
          style={{ padding: "4px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)" }}
        >
          <option value="AND">Match ALL (AND)</option>
          <option value="OR">Match ANY (OR)</option>
        </select>
        <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 11 }} onClick={addCondition}>+ Condition</button>
        <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 11 }} onClick={addGroup}>+ Group</button>
        {onRemove && (
          <button type="button" className="theme-btn theme-btn-ghost" style={{ fontSize: 11, color: "var(--error)" }} onClick={onRemove}>Remove group</button>
        )}
      </div>
      {(group.children || []).map((child, i) => (
        "field" in child ? (
          <ConditionRow
            key={i}
            condition={child as ReportCondition}
            onChange={(c) => updateChild(i, c)}
            onRemove={() => removeChild(i)}
            fields={fields}
          />
        ) : (
          <GroupEditor
            key={i}
            group={child as ReportGroup}
            onChange={(g) => updateChild(i, g)}
            onRemove={() => removeChild(i)}
            fields={fields}
            depth={depth + 1}
          />
        )
      ))}
    </div>
  );
}

export function FilterBuilder({ filter, onChange, fields }: Props) {
  const root = filter || { op: "AND" as const, children: [] };

  const applyTemplate = (template: (typeof QUICK_TEMPLATES)[0]) => {
    onChange(template.filter);
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 8px", fontSize: "0.9rem", fontWeight: 600 }}>Filters</h3>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 8 }}>Quick:</span>
        {QUICK_TEMPLATES.map((t) => (
          <button
            key={t.name}
            type="button"
            className="theme-btn theme-btn-ghost"
            style={{ fontSize: 11, marginRight: 6 }}
            onClick={() => applyTemplate(t)}
          >
            {t.name}
          </button>
        ))}
      </div>
      <GroupEditor
        group={root}
        onChange={onChange}
        fields={fields}
        depth={0}
      />
      {root.children?.length ? (
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
          <strong>Query summary:</strong> {querySummary(root, fields)}
        </p>
      ) : null}
    </div>
  );
}
