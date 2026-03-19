function normalizePhoneNumber(phoneNumber) {
  if (phoneNumber === undefined || phoneNumber === null) {
    return null;
  }

  const normalized = String(phoneNumber).replace(/\D/g, "");

  if (normalized.length < 10 || normalized.length > 15) {
    return null;
  }

  return normalized;
}

module.exports = {
  normalizePhoneNumber
};
