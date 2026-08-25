<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">セグメント管理</h1>
        <p class="text-gray-600">運用セグメントの作成と所属ユーザーの管理。一括資産調整の対象絞り込みに使用します</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">
        新規セグメント作成
      </v-btn>
    </div>

    <!-- Filters -->
    <v-card class="mb-6">
      <v-card-text class="py-4">
        <div class="flex items-center space-x-4">
          <v-text-field v-model="searchQuery" label="セグメント名検索" prepend-inner-icon="mdi-magnify" variant="outlined"
            density="compact" clearable class="w-64" />
          <v-btn variant="outlined" prepend-icon="mdi-refresh" @click="loadSegments">
            更新
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Permission Error -->
    <v-alert v-if="loadError" type="error" variant="tonal" class="mb-6">
      {{ loadError }}
    </v-alert>

    <!-- Segments Table -->
    <v-card v-if="!loadError">
      <v-card-title class="px-6 py-4 border-b">
        <h3 class="text-lg font-semibold text-gray-900">セグメント一覧</h3>
      </v-card-title>

      <v-data-table :headers="headers" :items="filteredSegments" :loading="loading" :items-per-page="15"
        class="elevation-0" no-data-text="セグメントが見つかりません" loading-text="読み込み中...">
        <template #[`item.name`]="{ item }">
          <span class="font-medium">{{ item.name }}</span>
        </template>

        <template #[`item.description`]="{ item }">
          <div class="max-w-xs">
            <p class="truncate" :title="item.description || '説明なし'">
              {{ item.description || '説明なし' }}
            </p>
          </div>
        </template>

        <template #[`item.member_count`]="{ item }">
          <v-chip color="primary" size="small" variant="flat">
            {{ item.member_count }}人
          </v-chip>
        </template>

        <template #[`item.created_at`]="{ item }">
          {{ formatDate(item.created_at) }}
        </template>

        <template #[`item.actions`]="{ item }">
          <div class="flex items-center space-x-1">
            <v-btn size="small" variant="text" color="info" prepend-icon="mdi-account-group"
              @click="openMembersDialog(item)" />
            <v-btn size="small" variant="text" color="primary" prepend-icon="mdi-pencil" @click="openEditDialog(item)" />
            <v-btn size="small" variant="text" color="error" prepend-icon="mdi-delete" @click="deleteSegment(item)" />
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Segment Management Dialog -->
    <AdminSegmentManagementDialog v-model="showManagementDialog" :segment="selectedSegment"
      @created="handleSegmentSaved" @updated="handleSegmentSaved" />

    <!-- Segment Members Dialog -->
    <AdminSegmentMembersDialog v-model="showMembersDialog" :segment="selectedSegment"
      @updated="loadSegments" />
  </div>
</template>

<script setup lang="ts">
import type { SegmentWithMemberCount } from '~/types'

definePageMeta({
  middleware: 'auth',
  requireAdmin: true,
  layout: 'default'
})

useHead({
  title: 'セグメント管理 - M・S CFD App'
})

const logger = useLogger({ prefix: '[AdminSegments]' })
const { showSuccess, showError } = useNotification()
const apiClient = useApiClient()

// State
const segments = ref<SegmentWithMemberCount[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const searchQuery = ref('')
const showManagementDialog = ref(false)
const showMembersDialog = ref(false)
const selectedSegment = ref<SegmentWithMemberCount | null>(null)

// Table headers
const headers = [
  { title: 'セグメント名', key: 'name', sortable: true },
  { title: '説明', key: 'description', sortable: false },
  { title: '所属人数', key: 'member_count', sortable: true },
  { title: '作成日', key: 'created_at', sortable: true },
  { title: 'アクション', key: 'actions', sortable: false, width: 160 }
]

// Computed
const filteredSegments = computed(() => {
  if (!searchQuery.value) return segments.value

  const query = searchQuery.value.toLowerCase()
  return segments.value.filter(segment =>
    segment.name.toLowerCase().includes(query) ||
    (segment.description && segment.description.toLowerCase().includes(query))
  )
})

// Methods
const loadSegments = async () => {
  loading.value = true
  loadError.value = null
  try {
    const response = await apiClient.get<{ items: SegmentWithMemberCount[] }>('/admin/segments')

    if (!response.success) {
      if (response.statusCode === 403) {
        loadError.value = 'セグメント情報を閲覧する権限がありません。管理者にお問い合わせください。'
      } else {
        loadError.value = response.error || 'セグメント一覧の取得に失敗しました'
      }
      showError(loadError.value)
      return
    }

    segments.value = response.data?.items || []
  } catch (error) {
    logger.error('セグメント一覧の読み込みに失敗しました:', error)
    loadError.value = 'セグメント一覧の取得に失敗しました'
    showError(loadError.value)
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  selectedSegment.value = null
  showManagementDialog.value = true
}

const openEditDialog = (segment: SegmentWithMemberCount) => {
  selectedSegment.value = segment
  showManagementDialog.value = true
}

const openMembersDialog = (segment: SegmentWithMemberCount) => {
  selectedSegment.value = segment
  showMembersDialog.value = true
}

const deleteSegment = async (segment: SegmentWithMemberCount) => {
  if (!confirm(`セグメント「${segment.name}」を削除してもよろしいですか？この操作は取り消せません。`)) {
    return
  }

  try {
    const response = await apiClient.delete(`/admin/segments/${segment.segment_id}`)

    if (!response.success) {
      if (response.statusCode === 403) {
        showError('セグメントを削除する権限がありません')
      } else {
        showError(response.error || 'セグメントの削除に失敗しました')
      }
      return
    }

    showSuccess(`セグメント「${segment.name}」を削除しました`)
    await loadSegments()
  } catch (error) {
    logger.error('セグメントの削除に失敗しました:', error)
    showError('セグメントの削除に失敗しました')
  }
}

const handleSegmentSaved = () => {
  showManagementDialog.value = false
  selectedSegment.value = null
  loadSegments()
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  loadSegments()
})
</script>
