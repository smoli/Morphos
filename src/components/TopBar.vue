<script setup lang="ts">
defineProps<{ historyCount: number }>();
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">
      <span class="logo">◈</span>
      <span>
        <span class="brand-name">Morphos</span>
        <span class="brand-sub">Die App, die sich selbst entwickelt</span>
      </span>
    </RouterLink>
    <RouterLink to="/versions" class="versions">
      ⟲ Versionen ({{ historyCount }})
    </RouterLink>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--text);
}
.logo {
  font-size: 22px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-name {
  display: block;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.3px;
}
.brand-sub {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.versions {
  color: var(--text);
  text-decoration: none;
  border: 1px solid var(--border);
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 13px;
}
.versions:hover {
  border-color: var(--accent);
}
</style>
