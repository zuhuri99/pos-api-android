import { readServerProfile, profileEndpoints } from "./serverProfile";
import { probeHealth, selectHealthyEndpoint } from "../platform/health";

const env = import.meta.env;
const configured = readServerProfile();
const endpoints = configured ? profileEndpoints(configured) : [{
  apiUrl: env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1",
  healthUrl: env.VITE_HEALTH_URL || "http://127.0.0.1:8000/health",
}];
if (!configured && env.VITE_API_BASE_URL_2 && env.VITE_HEALTH_URL_2) {
  endpoints.push({ apiUrl: env.VITE_API_BASE_URL_2, healthUrl: env.VITE_HEALTH_URL_2 });
}
let activeEndpoint = endpoints[0];
export const isHealthy = async (url) => (await probeHealth(url)).ok;
export const initializeApiEndpoint = async () => {
  const { endpoint } = await selectHealthyEndpoint(endpoints);
  activeEndpoint = endpoint || endpoints[0];
  return activeEndpoint;
};
export const getApiBaseUrl = () => activeEndpoint.apiUrl;
export const checkActiveEndpointHealth = () => isHealthy(activeEndpoint.healthUrl);
export const getActiveEndpointStatus = () => probeHealth(activeEndpoint.healthUrl);
