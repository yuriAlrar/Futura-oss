<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

// Page title
useHead({
  title: '一括資産調整 - 管理者'
})

// State
const historyRef = ref<{ refresh: () => void } | null>(null)
const selectedBatchId = ref<string | null>(null)
const showDetailDialog = ref(false)

// Handle success
function handleOperationSuccess() {
  // Refresh history
  if (historyRef.value) {
    historyRef.value.refresh()
  }
}

// Handle view detail
function handleViewDetail(batchId: string) {
  selectedBatchId.value = batchId
  showDetailDialog.value = true
}
</script>

<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h4 mb-4">一括資産調整</h1>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <AdminBatchOperationController @success="handleOperationSuccess" />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <AdminBatchOperationHistory
          ref="historyRef"
          @view-detail="handleViewDetail"
        />
      </v-col>
    </v-row>

    <!-- Detail Dialog -->
    <AdminBatchOperationDetailDialog
      v-model="showDetailDialog"
      :batch-id="selectedBatchId"
    />
  </v-container>
</template>
