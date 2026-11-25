<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'info' | 'error' }>(), { tone: 'info' })
</script>

<template>
  <!-- z-900: above Leaflet panes and the legend, below the header and the station panel. -->
  <p
    class="absolute inset-x-4 top-3 z-900 mx-auto w-fit rounded-md bg-card px-3 py-1.5 text-sm shadow-md"
    :class="tone === 'error' ? 'text-destructive' : 'text-card-foreground'"
  >
    <slot />
  </p>
</template>
