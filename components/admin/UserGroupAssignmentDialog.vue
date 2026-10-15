<template>
  <v-dialog 
    :model-value="modelValue" 
    max-width="800"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="px-6 py-4 border-b">
        <h3 class="text-lg font-semibold text-gray-900">
          グループメンバー管理: {{ group?.GroupName }}
        </h3>
        <p class="text-sm text-gray-600 mt-1">
          {{ group?.Description || 'グループの説明なし' }}
        </p>
      </v-card-title>

      <v-card-text class="px-6 py-6">
        <div class="space-y-6">
          <!-- Add User Section -->
          <div class="bg-gray-50 p-4 rounded-lg">
            <h4 class="text-md font-medium text-gray-900 mb-3">ユーザーをグループに追加</h4>
            <div class="flex items-center space-x-3">
              <v-select
                v-model="selectedUserId"
                :items="availableUserOptions"
                label="ユーザーを選択"
                variant="outlined"
                density="compact"
                class="flex-1"
                clearable
              />
              <v-btn
                color="primary"
                :loading="addingUser"
                :disabled="!selectedUserId"
                @click="addUserToGroup"
              >
                <Icon name="mdi:plus" class="mr-1" />
                追加
              </v-btn>
            </div>
          </div>

          <!-- Current Members Section -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-md font-medium text-gray-900">現在のメンバー ({{ groupMembers.length }}名)</h4>
              <v-btn
                variant="outlined"
                size="small"
                prepend-icon="mdi-refresh"
                :loading="loading"
                @click="loadGroupMembers"
              >
                更新
              </v-btn>
            </div>

            <!-- Members List -->
            <div v-if="loading" class="text-center py-6">
              <v-progress-circular indeterminate color="primary" />
              <p class="text-gray-600 mt-2">読み込み中...</p>
            </div>

            <div v-else-if="groupMembers.length === 0" class="text-center py-6">
              <Icon name="mdi:account-group-outline" class="text-4xl text-gray-400 mb-2" />
              <p class="text-gray-600">このグループにはメンバーがいません</p>
            </div>

            <div v-else class="space-y-2">
              <v-card
                v-for="member in groupMembers"
                :key="member.user_id"
                variant="outlined"
                class="pa-4"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-3">
                    <v-avatar size="40" color="primary">
                      <span class="text-sm font-medium">{{ getUserInitials(member.name) }}</span>
                    </v-avatar>
                    <div>
                      <p class="font-medium text-gray-900">{{ member.name }}</p>
                      <p class="text-sm text-gray-600">{{ member.email }}</p>
                      <p class="text-xs text-gray-500">
                        ステータス: 
                        <v-chip
                          :color="getStatusColor(member.status)"
                          size="x-small"
                          variant="flat"
                        >
                          {{ getStatusText(member.status) }}
                        </v-chip>
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center space-x-2">
                    <v-btn
                      v-if="group?.GroupName !== 'administrator' || canRemoveFromAdmin(member)"
                      size="small"
                      variant="text"
                      color="error"
                      icon="mdi-account-minus"
                      :loading="removingUserId === member.user_id"
                      @click="removeUserFromGroup(member)"
                    />
                    <v-tooltip v-else>
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          size="small"
                          variant="text"
                          color="grey"
                          icon="mdi-lock"
                          disabled
                        />
                      </template>
                      管理者グループから最後の管理者は削除できません
                    </v-tooltip>
                  </div>
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
import type { CognitoGroup, User } from '~/types'

const apiClient = useApiClient()

interface GroupMember extends User {
  // User interface already contains all needed fields
}

interface Props {
  modelValue: boolean
  group?: CognitoGroup | null
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'updated'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const logger = useLogger({ prefix: '[UserGroupAssignmentDialog]' })
const { showSuccess, showError } = useNotification()

// State
const loading = ref(false)
const addingUser = ref(false)
const removingUserId = ref<string | null>(null)
const selectedUserId = ref<string>('')
const groupMembers = ref<GroupMember[]>([])
const allUsers = ref<User[]>([])

// Computed
const availableUserOptions = computed(() => {
  const memberIds = new Set(groupMembers.value.map(m => m.user_id))
  return allUsers.value
    .filter(user => !memberIds.has(user.user_id) && user.status === 'active')
    .map(user => ({
      title: `${user.name} (${user.email})`,
      value: user.user_id
    }))
})

// Methods
const loadAllUsers = async () => {
  try {
    allUsers.value = await apiClient.getAllPages<User>('/admin/users')
  } catch (error) {
    logger.error('ユーザー一覧の読み込みに失敗しました:', error)
    showError('ユーザー一覧の取得に失敗しました')
  }
}

const loadGroupMembers = async () => {
  if (!props.group) return

  loading.value = true
  try {
    const response = await apiClient.get<{ users: GroupMember[] }>(`/admin/groups/${props.group.GroupName}/users`)
    const data = response.data!
    groupMembers.value = data.users
  } catch (error) {
    logger.error('グループメンバーの読み込みに失敗しました:', error)
    showError('グループメンバーの取得に失敗しました')
  } finally {
    loading.value = false
  }
}

const addUserToGroup = async () => {
  if (!selectedUserId.value || !props.group) return

  addingUser.value = true
  try {
    await apiClient.post(`/admin/users/${selectedUserId.value}/groups`, { groupName: props.group.GroupName })

    const user = allUsers.value.find(u => u.user_id === selectedUserId.value)
    showSuccess(`「${user?.name}」をグループ「${props.group.GroupName}」に追加しました`)
    
    selectedUserId.value = ''
    await loadGroupMembers()
    emit('updated')
  } catch (error: any) {
    logger.error('ユーザーのグループ追加に失敗しました:', error)
    
    let errorMessage = 'ユーザーのグループ追加に失敗しました'
    if (error?.data?.message) {
      errorMessage = error.data.message
    }
    
    showError(errorMessage)
  } finally {
    addingUser.value = false
  }
}

const removeUserFromGroup = async (member: GroupMember) => {
  if (!props.group) return

  // Prevent removing the last administrator
  if (props.group.GroupName === 'administrator' && !canRemoveFromAdmin(member)) {
    showError('管理者グループから最後の管理者は削除できません')
    return
  }

  if (!confirm(`「${member.name}」をグループ「${props.group.GroupName}」から削除してもよろしいですか？`)) {
    return
  }

  removingUserId.value = member.user_id
  try {
    await apiClient.delete(`/admin/users/${member.user_id}/groups/${props.group.GroupName}`)

    showSuccess(`「${member.name}」をグループ「${props.group.GroupName}」から削除しました`)
    await loadGroupMembers()
    emit('updated')
  } catch (error: any) {
    logger.error('ユーザーのグループ削除に失敗しました:', error)
    
    let errorMessage = 'ユーザーのグループ削除に失敗しました'
    if (error?.data?.message) {
      errorMessage = error.data.message
    }
    
    showError(errorMessage)
  } finally {
    removingUserId.value = null
  }
}

const canRemoveFromAdmin = (member: GroupMember): boolean => {
  if (props.group?.GroupName !== 'administrator') return true
  
  // Count active administrators
  const activeAdminCount = groupMembers.value.filter(m => m.status === 'active').length
  return activeAdminCount > 1 || member.status !== 'active'
}

const closeDialog = () => {
  emit('update:modelValue', false)
  selectedUserId.value = ''
}

// Utility functions
const getUserInitials = (name: string): string => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'success'
    case 'suspended': return 'warning'
    case 'deleted': return 'error'
    default: return 'grey'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'active': return 'アクティブ'
    case 'suspended': return '停止中'
    case 'deleted': return '削除済み'
    default: return status
  }
}

// Watch for dialog open/close
watch(() => props.modelValue, (newValue) => {
  if (newValue && props.group) {
    loadAllUsers()
    loadGroupMembers()
  }
})

// Watch for group changes
watch(() => props.group, () => {
  if (props.modelValue && props.group) {
    loadGroupMembers()
  }
})
</script>