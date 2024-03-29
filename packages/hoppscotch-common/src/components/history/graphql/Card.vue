<template>
  <div class="group flex flex-col">
    <div class="flex items-center">
      <span
        v-tippy="{
          theme: 'tooltip',
          delay: [500, 20],
          content: entry.updatedOn ? shortDateTime(entry.updatedOn) : null,
        }"
        class="flex min-w-0 flex-1 cursor-pointer py-2 pl-4 pr-2 transition group-hover:text-secondaryDark"
        data-testid="restore_history_entry"
        @click="useEntry"
      >
        <span class="truncate">
          {{ entry.request.url }}
        </span>
      </span>
      <HoppButtonSecondary
        v-tippy="{ theme: 'tooltip' }"
        :icon="IconTrash"
        color="red"
        :title="t('action.remove')"
        class="hidden group-hover:inline-flex"
        data-testid="delete_history_entry"
        @click="emit('delete-entry')"
      />
      <HoppButtonSecondary
        v-tippy="{ theme: 'tooltip' }"
        :title="expand ? t('hide.more') : t('show.more')"
        :icon="expand ? IconMinimize2 : IconMaximize2"
        class="hidden group-hover:inline-flex"
        @click="expand = !expand"
      />
      <HoppButtonSecondary
        v-tippy="{ theme: 'tooltip' }"
        :title="!entry.star ? t('add.star') : t('remove.star')"
        :icon="entry.star ? IconStarOff : IconStar"
        color="yellow"
        :class="{ 'hidden group-hover:inline-flex': !entry.star }"
        data-testid="star_button"
        @click="emit('toggle-star')"
      />
    </div>
    <div class="flex flex-col text-tiny">
      <span
        v-for="(line, index) in query"
        :key="`line-${index}`"
        class="cursor-pointer truncate whitespace-pre px-4 font-mono text-secondaryLight"
        data-testid="restore_history_entry"
        @click="useEntry"
        >{{ line }}</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { GQLHistoryEntry } from "~/newstore/history"
import { shortDateTime } from "~/helpers/utils/date"

import IconStar from "~icons/lucide/star"
import IconStarOff from "~icons/hopp/star-off"
import IconTrash from "~icons/lucide/trash"
import IconMinimize2 from "~icons/lucide/minimize-2"
import IconMaximize2 from "~icons/lucide/maximize-2"

import { useI18n } from "@composables/i18n"
import { makeGQLRequest } from "@hoppscotch/data"
import { useService } from "dioc/vue"
import { GQLTabService } from "~/services/tab/graphql"

const t = useI18n()
const tabs = useService(GQLTabService)

const props = defineProps<{
  entry: GQLHistoryEntry
  showMore: boolean
}>()

const emit = defineEmits<{
  (e: "delete-entry"): void
  (e: "toggle-star"): void
}>()

const expand = ref(false)

const query = computed(() =>
  expand.value
    ? (props.entry.request.query.split("\n") as string[])
    : (props.entry.request.query
        .split("\n")
        .slice(0, 2)
        .concat(["..."]) as string[])
)

const useEntry = () => {
  tabs.createNewTab({
    request: makeGQLRequest({
      name: props.entry.request.name,
      url: props.entry.request.url,
      headers: props.entry.request.headers,
      query: props.entry.request.query,
      variables: props.entry.request.variables,
      auth: props.entry.request.auth,
    }),
    isDirty: false,
  })
}
</script>
