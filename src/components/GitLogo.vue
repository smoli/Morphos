<script setup lang="ts">
/**
 * Das Git-Logo als Zeichen — überall dort, wo es um das Repository einer App
 * geht (bisher: der Dock-Platz „App aus Git laden…“, c0078). Als Pfad im Bild
 * statt als Datei, damit es wie die anderen Zeichen im Dock einfach mitwächst.
 *
 * Das Logo stammt von Jason Long und steht unter CC BY 3.0.
 */
withDefaults(defineProps<{ size?: number; title?: string }>(), { size: 26, title: 'Git' });
</script>

<template>
  <svg
    class="git-logo"
    viewBox="0 0 97 97"
    :width="size"
    :height="size"
    role="img"
    :aria-label="title"
    focusable="false"
  >
    <path
      fill="#f05133"
      d="M92.71,44.408L52.591,4.291c-2.31-2.311-6.057-2.311-8.369,0l-8.33,8.332L46.02,22.75c2.456-0.83,5.272-0.273,7.229,1.685c1.969,1.97,2.521,4.81,1.67,7.275l9.712,9.712c2.465-0.85,5.308-0.3,7.275,1.671c2.75,2.75,2.75,7.206,0,9.957c-2.752,2.751-7.208,2.751-9.959,0c-2.068-2.07-2.58-5.11-1.531-7.658l-9.06-9.06v23.85c0.67,0.332,1.303,0.774,1.861,1.332c2.75,2.75,2.75,7.206,0,9.958c-2.75,2.749-7.209,2.749-9.957,0c-2.75-2.752-2.75-7.208,0-9.958c0.68-0.679,1.467-1.193,2.307-1.537v-24.07c-0.84-0.344-1.625-0.853-2.307-1.537c-2.083-2.082-2.584-5.14-1.516-7.698L31.798,16.715L4.288,44.222c-2.311,2.313-2.311,6.06,0,8.371l40.121,40.118c2.31,2.311,6.056,2.311,8.369,0L92.71,52.779C95.021,50.468,95.021,46.719,92.71,44.408z"
    />
  </svg>
</template>

<style scoped>
.git-logo {
  display: block;
  flex-shrink: 0;
}
</style>
