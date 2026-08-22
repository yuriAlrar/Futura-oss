<template>
  <div class="space-y-4">
    <v-text-field
      :model-value="modelValue"
      :label="label"
      :type="visible ? 'text' : 'password'"
      variant="outlined"
      :rules="rules"
      :autocomplete="autocomplete"
      :hint="hint"
      :persistent-hint="!!hint"
      :append-inner-icon="visible ? 'mdi-eye-off' : 'mdi-eye'"
      required
      @update:model-value="$emit('update:modelValue', $event)"
      @click:append-inner="visible = !visible"
    />

    <v-text-field
      v-if="confirm"
      v-model="confirmValue"
      :label="confirmLabel"
      :type="confirmVisible ? 'text' : 'password'"
      variant="outlined"
      :rules="confirmRules"
      :autocomplete="autocomplete"
      :append-inner-icon="confirmVisible ? 'mdi-eye-off' : 'mdi-eye'"
      required
      @click:append-inner="confirmVisible = !confirmVisible"
    />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  rules?: Array<(v: string) => boolean | string>
  autocomplete?: string
  hint?: string
  /** 確認用の再入力欄を併せて表示し、一致検証をコンポーネント内で完結させる */
  confirm?: boolean
  confirmLabel?: string
}>(), {
  rules: undefined,
  autocomplete: undefined,
  hint: undefined,
  confirm: false,
  confirmLabel: 'パスワード（確認） *'
})

defineEmits<{
  'update:modelValue': [value: string]
}>()

const visible = ref(false)
const confirmVisible = ref(false)
const confirmValue = ref('')

const confirmRules = computed(() => [
  (v: string) => !!v || '確認用のパスワードを入力してください',
  (v: string) => v === props.modelValue || 'パスワードが一致しません'
])
</script>
