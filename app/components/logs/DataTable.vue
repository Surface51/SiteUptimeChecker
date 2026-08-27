<script setup lang="ts">
export interface LogColumn {
  key: string
  label: string
  /** Right-aligns and uses tabular figures — for anything numeric. */
  numeric?: boolean
  /** Monospace, for paths, IPs and identifiers. */
  mono?: boolean
  format?: (value: any, row: Record<string, any>) => string
  class?: string
}

withDefaults(
  defineProps<{
    title: string
    columns: LogColumn[]
    rows: Record<string, any>[]
    pending?: boolean
    /** Shown instead of the table when there are no rows. */
    empty?: string
    /** Minimum table width before the container scrolls horizontally. */
    minWidth?: string
    /** Row identity for the expand toggle; enables the #detail slot when set. */
    rowKey?: string
    csvHref?: string
  }>(),
  { empty: 'Nothing in this range', minWidth: '640px' },
)

const expanded = ref<string | null>(null)

function toggle(key: string | undefined) {
  if (key === undefined) return
  expanded.value = expanded.value === key ? null : key
}

function cell(column: LogColumn, row: Record<string, any>) {
  const raw = row[column.key]
  if (column.format) return column.format(raw, row)
  return raw === null || raw === undefined || raw === '' ? '—' : String(raw)
}
</script>

<template>
  <UiCard flush>
    <div class="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
      <UiSectionHeading as="h3">{{ title }}</UiSectionHeading>
      <div class="flex items-center gap-2">
        <slot name="actions" />
        <a
          v-if="csvHref"
          :href="csvHref"
          class="text-xs text-tertiary no-underline transition-colors hover:text-accent"
        >
          Export CSV
        </a>
      </div>
    </div>

    <div v-if="pending && !rows.length" class="px-6 pb-6 text-sm text-tertiary">Loading…</div>

    <div v-else-if="!rows.length" class="px-6 pb-6 text-sm text-tertiary">{{ empty }}</div>

    <div v-else class="overflow-x-auto">
      <table class="w-full border-collapse text-sm" :style="{ minWidth }">
        <thead>
          <tr class="border-y border-border-default">
            <th
              v-for="column in columns"
              :key="column.key"
              class="px-4 py-2 text-xs font-semibold tracking-wide text-tertiary uppercase"
              :class="column.numeric ? 'text-right' : 'text-left'"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, index) in rows" :key="rowKey ? row[rowKey] : index">
            <tr
              class="border-b border-border-default transition-colors"
              :class="rowKey && $slots.detail ? 'cursor-pointer hover:bg-sunken' : ''"
              @click="rowKey && $slots.detail ? toggle(String(row[rowKey])) : undefined"
            >
              <td
                v-for="column in columns"
                :key="column.key"
                class="px-4 py-2.5 text-primary"
                :class="[
                  column.numeric ? 'text-right tabular-nums' : 'text-left',
                  column.mono ? 'max-w-[420px] truncate font-mono text-xs' : '',
                  column.class ?? '',
                ]"
                :title="column.mono ? String(row[column.key] ?? '') : undefined"
              >
                <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
                  {{ cell(column, row) }}
                </slot>
              </td>
            </tr>
            <tr v-if="rowKey && $slots.detail && expanded === String(row[rowKey])">
              <td :colspan="columns.length" class="bg-sunken px-4 py-4">
                <slot name="detail" :row="row" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="$slots.footer" class="border-t border-border-default p-4">
      <slot name="footer" />
    </div>
  </UiCard>
</template>
