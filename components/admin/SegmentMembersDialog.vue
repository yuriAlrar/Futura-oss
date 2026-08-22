<template>
  <v-dialog :model-value="modelValue" max-width="800" persistent
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="px-6 py-4 border-b">
        <h3 class="text-lg font-semibold text-gray-900">
          セグメントメンバー管理: {{ segment?.name }}
        </h3>
        <p class="text-sm text-gray-600 mt-1">
          {{ segment?.description || '説明なし' }}
        </p>
      </v-card-title>

      <v-card-text class="px-6 py-6">
        <div class="space-y-6">
          <!-- Add User Section -->
          <div class="bg-gray-50 p-4 rounded-lg">
            <h4 class="text-md font-medium text-gray-900 mb-3">ユーザーをセグメントに追加</h4>
            <div class="flex items-center space-x-3">
              <v-select v-model="selectedUserId" :items="availableUserOptions" label="ユーザーを選択" variant="outlined"
                density="compact" class="flex-1" clearable />
              <v-btn color="primary" :loading="addingUser" :disabled="!selectedUserId" @click="addUser">
                <Icon name="mdi:plus" class="mr-1" />
                追加
              </v-btn>
            </div>
          </div>

          <!-- Current Members Section -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-md font-medium text-gray-900">現在のメンバー ({{ members.length }}名)</h4>
              <v-btn variant="outlined" size="small" prepend-icon="mdi-refresh" :loading="loading" @click="loadMembers">
                更新
              </v-btn>
            </div>

            <div v-if="loading" class="text-center py-6">
              <v-progress-circular indeterminate color="primary" />
              <p class="text-gray-600 mt-2">読み込み中...</p>
            </div>

            <div v-else-if="members.length === 0" class="text-center py-6">
              <Icon name="mdi:account-group-outline" class="text-4xl text-gray-400 mb-2" />
              <p class="text-gray-600">このセグメントにはメンバーがいません</p>
            </div>

            <div v-else class="space-y-2">
              <v-card v-for="member in members" :key="member.user_id" variant="outlined" class="pa-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-medium text-gray-900">{{ member.name }}</p>
                    <p class="text-sm text-gray-600">{{ member.email }}</p>
                  </div>
                  <v-btn size="small" variant="text" color="error" icon="mdi-account-minus"
                    :loading="removingUserId === member.user_id" @click="removeUser(member)" />
                </div>
              </v-card>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="px-6 py-4 border-t">
        <v-spacer />
        <v-btn variant="outlined" @click="closeDialog">
          閉じる
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { Segment, User } from '~/types'

const apiClient = useApiClient()
const logger = useLogger({ prefix: '[SegmentMembersDialog]' })
const { showSuccess, showError } = useNotification()

const props = defineProps<{
  modelValue: boolean
  segment?: Segment | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  updated: []
}>()

const loading = ref(false)
const addingUser = ref(false)
const removingUserId = ref<string | null>(null)
const selectedUserId = ref<string>('')
const members = ref<User[]>([])
const allUsers = ref<User[]>([])

const availableUserOptions = computed(() => {
  const memberIds = new Set(members.value.map(m => m.user_id))
  return allUsers.value
    .filter(user => !memberIds.has(user.user_id) && user.status === 'active')
    .map(user => ({
      title: `${user.name} (${user.email})`,
      value: user.user_id
    }))
})

const loadAllUsers = async () => {
  try {
    const response = await apiClient.get<{ items: User[] }>('/admin/users')
    allUsers.value = response.data!.items
  } catch (error) {
    logger.error('ユーザー一覧の読み込みに失敗しました:', error)
    showError('ユーザー一覧の取得に失敗しました')
  }
}

const loadMembers = async () => {
  if (!props.segment) return

  loading.value = true
  try {
    const response = await apiClient.get<Segment & { members: User[] }>(`/admin/segments/${props.segment.segment_id}`)
    members.value = response.data?.members || []
  } catch (error) {
    logger.error('セグメントメンバーの読み込みに失敗しました:', error)
    showError('セグメントメンバーの取得に失敗しました')
  } finally {
    loading.value = false
  }
}

const addUser = async () => {
  if (!selectedUserId.value || !props.segment) return

  addingUser.value = true
  try {
    await apiClient.post(`/admin/segments/${props.segment.segment_id}/users`, { user_id: selectedUserId.value })

    const user = allUsers.value.find(u => u.user_id === selectedUserId.value)
    showSuccess(`「${user?.name}」をセグメント「${props.segment.name}」に追加しました`)

    selectedUserId.value = ''
    await loadMembers()
    emit('updated')
  } catch (error: any) {
    logger.error('セグメントへのユーザー追加に失敗しました:', error)
    showError(error?.data?.statusMessage || 'ユーザーの追加に失敗しました')
  } finally {
    addingUser.value = false
  }
}

const removeUser = async (member: User) => {
  if (!props.segment) return

  if (!confirm(`「${member.name}」をセグメント「${props.segment.name}」から削除してもよろしいですか？`)) {
    return
  }

  removingUserId.value = member.user_id
  try {
    await apiClient.delete(`/admin/segments/${props.segment.segment_id}/users/${member.user_id}`)
    showSuccess(`「${member.name}」をセグメント「${props.segment.name}」から削除しました`)
    await loadMembers()
    emit('updated')
  } catch (error: any) {
    logger.error('セグメントからのユーザー削除に失敗しました:', error)
    showError(error?.data?.statusMessage || 'ユーザーの削除に失敗しました')
  } finally {
    removingUserId.value = null
  }
}

const closeDialog = () => {
  emit('update:modelValue', false)
  selectedUserId.value = ''
}

watch(() => props.modelValue, (newValue) => {
  if (newValue && props.segment) {
    loadAllUsers()
    loadMembers()
  }
})

watch(() => props.segment, () => {
  if (props.modelValue && props.segment) {
    loadMembers()
  }
})
</script>
