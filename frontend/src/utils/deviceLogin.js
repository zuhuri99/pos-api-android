export const readLoginOffer = (value) => {
  const match = String(value || "").match(
    /^finance-login-offer:v1:([A-Za-z0-9_-]{32,128}):([0-9a-f-]{36}):([A-Za-z0-9_-]{32,128}):(\d{6})$/i,
  );
  return match ? {
    approval_token: match[1],
    challenge_id: match[2],
    exchange_token: match[3],
    display_code: match[4],
  } : null;
};
