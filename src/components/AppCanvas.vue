<script setup lang="ts">
defineProps<{ html: string }>();

// Bewusst OHNE allow-same-origin: der generierte Code bleibt isoliert und
// kann weder auf die Host-App noch auf Storage zugreifen.
const SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock';
</script>

<template>
  <iframe
    class="canvas"
    :srcdoc="html"
    :sandbox="SANDBOX"
    referrerpolicy="no-referrer"
  ></iframe>
</template>

<style scoped>
.canvas {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
</style>
