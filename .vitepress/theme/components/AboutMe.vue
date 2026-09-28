<template>
  <div class="about-page">
    <div class="about-content">
      <div class="about-avatar">
        <img src="/avator.png" alt="深念" />
      </div>
      <h1 class="about-name">深念</h1>
      <p class="about-bio"></p>
      <div class="about-desc">
        <p></p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - var(--vp-nav-height, 64px) - 80px);
  padding: 40px 24px;
}

.about-content {
  max-width: 580px;
  width: 100%;
  text-align: center;
}

.about-avatar {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.about-avatar img {
  width: 135px;
  height: 135px;
  border-radius: 50%;
  border: 5px solid var(--vp-avator-border);
}

@keyframes avator-transform {
  from { transform: rotate(0); }
  to { transform: rotate(360deg); }
}
.about-avatar img:hover {
  animation: 5s linear 0s infinite avator-transform;
}

.about-name {
  font-size: 2.2em;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  margin: 0 0 8px;
  line-height: 1.2;
}

.about-bio {
  font-size: 1.1em;
  color: var(--vp-c-text-2);
  margin: 0 0 28px;
  font-weight: 500;
}

.about-desc {
  text-align: left;
  font-size: 0.95em;
  color: var(--vp-c-text-2);
  line-height: 1.9;
}

.about-desc p {
  margin: 0 0 16px;
}

.about-desc p:last-child {
  margin-bottom: 0;
}

.highlight {
  color: var(--vp-c-text-1);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: var(--vp-c-brand);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.highlight-link {
  color: var(--vp-c-text-1);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: var(--vp-c-brand);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  transition: color 0.2s;
}

.highlight-link:hover {
  color: var(--vp-c-brand);
}

@media (max-width: 640px) {
  .about-name {
    font-size: 1.8em;
  }
  .about-page {
    padding: 32px 20px;
    padding-bottom:80px;
  }
}
</style>
