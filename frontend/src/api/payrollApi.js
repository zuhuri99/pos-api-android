import api from "./axios";

const payrollPath = "/payroll";

export const listResults = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export const paginationInfo = (payload, page = 1, pageSize = 25) => ({
  count: Number(payload?.count ?? listResults(payload).length),
  page,
  pageSize,
});

export const getApiError = (error, fallback = "Terjadi kesalahan.") => {
  const data = error?.response?.data;
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.detail === "string") return data.detail;
  if (data?.message && typeof data.message === "object") {
    return Object.entries(data.message)
      .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages}`)
      .join(" · ");
  }
  if (data && typeof data === "object") {
    const message = Object.entries(data)
      .filter(([key]) => key !== "error")
      .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages}`)
      .join(" · ");
    if (message) return message;
  }
  return error?.message || fallback;
};

const fetchAll = async (path, params) => {
  const items = [];
  let response = await api.get(path, { params });
  let guard = 0;
  items.push(...listResults(response.data));
  while (response.data?.next && guard < 100) {
    const nextUrl = new URL(response.data.next, window.location.origin);
    response = await api.get(`${path}${nextUrl.search}`);
    items.push(...listResults(response.data));
    guard += 1;
  }
  return { ...response, data: items };
};

export const payrollApi = {
  employees: {
    list: (params) => api.get(`${payrollPath}/employees/`, { params }),
    all: (params) => fetchAll(`${payrollPath}/employees/`, params),
    get: (id) => api.get(`${payrollPath}/employees/${id}/`),
    create: (data) => api.post(`${payrollPath}/employees/`, data),
    update: (id, data) => api.patch(`${payrollPath}/employees/${id}/`, data),
    remove: (id) => api.delete(`${payrollPath}/employees/${id}/`),
  },
  payRates: {
    list: (params) => api.get(`${payrollPath}/pay-rates/`, { params }),
    all: (params) => fetchAll(`${payrollPath}/pay-rates/`, params),
    create: (data) => api.post(`${payrollPath}/pay-rates/`, data),
    update: (id, data) => api.patch(`${payrollPath}/pay-rates/${id}/`, data),
    remove: (id) => api.delete(`${payrollPath}/pay-rates/${id}/`),
  },
  attendance: {
    list: (params) => api.get(`${payrollPath}/attendance/`, { params }),
    all: (params) => fetchAll(`${payrollPath}/attendance/`, params),
    create: (data) => api.post(`${payrollPath}/attendance/`, data),
    bulkUpsert: (data) => api.post(`${payrollPath}/attendance/bulk-upsert/`, data),
    update: (id, data) => api.patch(`${payrollPath}/attendance/${id}/`, data),
    remove: (id) => api.delete(`${payrollPath}/attendance/${id}/`),
  },
  periods: {
    list: (params) => api.get(`${payrollPath}/periods/`, { params }),
    all: (params) => fetchAll(`${payrollPath}/periods/`, params),
    create: (data) => api.post(`${payrollPath}/periods/`, data),
    replace: (id, data) => api.put(`${payrollPath}/periods/${id}/`, data),
    update: (id, data) => api.patch(`${payrollPath}/periods/${id}/`, data),
    remove: (id) => api.delete(`${payrollPath}/periods/${id}/`),
    calculate: (id, employeeIds = []) =>
      api.post(`${payrollPath}/periods/${id}/calculate/`, employeeIds.length ? { employee_ids: employeeIds } : {}),
  },
  slips: {
    list: (params) => api.get(`${payrollPath}/slips/`, { params }),
    all: (params) => fetchAll(`${payrollPath}/slips/`, params),
    get: (id) => api.get(`${payrollPath}/slips/${id}/`),
    recalculate: (id) => api.post(`${payrollPath}/slips/${id}/recalculate/`, {}),
    setNote: (id, note) => api.post(`${payrollPath}/slips/${id}/set-note/`, { note }),
    publish: (id, data = {}) => api.post(`${payrollPath}/slips/${id}/publish/`, data),
    cancel: (id, reason) => api.post(`${payrollPath}/slips/${id}/cancel/`, { reason }),
    revise: (id, reason) => api.post(`${payrollPath}/slips/${id}/revise/`, { reason }),
    markPaid: (id, data = {}) => api.post(`${payrollPath}/slips/${id}/mark-paid/`, data),
    calculateMonthly: (data) => api.post(`${payrollPath}/monthly-slips/calculate/`, data),
    findByIdentifier: (identifier, field = "public_token") =>
      api.get(`${payrollPath}/slips/`, { params: { [field]: identifier } }),
  },
  adjustments: {
    list: (params) => api.get(`${payrollPath}/adjustments/`, { params }),
    create: (data) => api.post(`${payrollPath}/adjustments/`, data),
    remove: (id) => api.delete(`${payrollPath}/adjustments/${id}/`),
  },
  receivables: {
    list: (params) => api.get(`${payrollPath}/receivables/`, { params }),
    all: (params) => fetchAll(`${payrollPath}/receivables/`, params),
    get: (id) => api.get(`${payrollPath}/receivables/${id}/`),
    create: (data) => api.post(`${payrollPath}/receivables/`, data),
    replace: (id, data) => api.put(`${payrollPath}/receivables/${id}/`, data),
    update: (id, data) => api.patch(`${payrollPath}/receivables/${id}/`, data),
    remove: (id) => api.delete(`${payrollPath}/receivables/${id}/`),
  },
  receivableTransactions: {
    list: (params) => api.get(`${payrollPath}/receivable-transactions/`, { params }),
    create: (data) => api.post(`${payrollPath}/receivable-transactions/`, data),
  },
};
