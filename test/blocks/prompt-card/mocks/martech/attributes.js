import sinon from 'sinon';

// eslint-disable-next-line import/prefer-default-export
export const processTrackingLabels = sinon.stub().callsFake((label) => `tracked-${label}`);
