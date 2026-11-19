let config = { env: { name: 'stage' } };

export function setConfig(value) {
  config = value;
}

export function getConfig() {
  return config;
}
