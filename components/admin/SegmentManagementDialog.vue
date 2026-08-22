<template>
  <v-dialog :model-value="modelValue" max-width="500" persistent
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="text-lg font-semibold">
        {{ segment ? 'セグメント編集' : '新規セグメント作成' }}
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent="submit">
          <div class="space-y-4">
            <v-text-field v-model="form.name" label="セグメント名 *" variant="outlined" :rules="nameRules" required />
            <v-textarea v-model="form.description" label="説明（任意）" variant="outlined" rows="3" />
          </div>
        </v-form>
      </v-card-text>

      <v-card-actions class="flex justify-end gap-2 px-6 pb-6">
        <v-btn variant="text" :disabled="loading" @click="cancel">
          キャンセル
        </v-btn>
        <v-btn color="primary" :loading="loading" @click="submit">
          {{ segment ? '更新' : '作成' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { Segment, SegmentCreateForm, SegmentUpdateForm } from '~/types'

const apiClient = useApiClient()
const logger = useLogger({ prefix: '[SegmentManagementDialog]' })
const { showSuccess, showError } = useNotification()

const props = defineProps<{
  modelValue: boolean
  segment?: Segment | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: []
  updated: []
}>()

const formRef = ref<any>(null)
const loading = ref(false)

const form = reactive<SegmentCreateForm>({
  name: '',
  description: ''
})

const nameRules = [
  (v: string) => !!v || 'セグメント名は必須です'
]

const resetForm = () => {
  form.name = props.segment?.name || ''
  form.description = props.segment?.description || ''
  formRef.value?.resetValidation()
}

const cancel = () => {
  emit('update:modelValue', false)
}

const submit = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  loading.value = true
  try {
    if (props.segment) {
      const payload: SegmentUpdateForm = { name: form.name, description: form.description }
      await apiClient.put(`/admin/segments/${props.segment.segment_id}`, payload)
      showSuccess('セグメントを更新しました')
      emit('updated')
    } else {
      await apiClient.post('/admin/segments', form)
      showSuccess('セグメントを作成しました')
      emit('created')
    }
  } catch (error: any) {
    logger.error('セグメント保存エラー:', error)
    showError(error?.data?.statusMessage || 'セグメントの保存に失敗しました')
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    resetForm()
  }
})
</script>
