const API_BASE = "https://api.app-prg1.zerops.io/api/rest/public";

export class ZeropsClient {
  constructor(private token: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = body?.error?.message ?? `${res.status} ${res.statusText}`;
      throw new Error(`Zerops API ${path} failed: ${message}`);
    }
    return body as T;
  }

  async getClientId(): Promise<{ clientId: string; email: string }> {
    const info = await this.request<{
      clientUserList: { client: { id: string } }[];
      email: string;
    }>("/user/info");
    const clientId = info.clientUserList[0]?.client.id;
    if (!clientId) throw new Error("Could not resolve a Zerops client/account for this token");
    return { clientId, email: info.email };
  }

  async createProject(clientId: string, name: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/client/${clientId}/project`, {
      method: "POST",
      body: JSON.stringify({ name, tagList: [], userRoles: [] }),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request(`/project/${projectId}`, { method: "DELETE" });
  }

  async createServiceStack(
    projectId: string,
    params: { name: string; serviceStackVersionName: string; buildFromGit?: string; enableSubdomainAccess?: boolean },
  ): Promise<{ serviceStacks: { id: string; name: string }[] }> {
    return this.request(`/project/${projectId}/service-stack`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async deleteServiceStack(serviceStackId: string): Promise<void> {
    await this.request(`/service-stack/${serviceStackId}`, { method: "DELETE" });
  }

  async getServiceStack(serviceStackId: string): Promise<{
    id: string;
    status: string;
    userData: { key: string; content: string }[];
  }> {
    return this.request(`/service-stack/${serviceStackId}`);
  }

  async listAppVersions(
    serviceStackId: string,
  ): Promise<{ list: { id: string; status: string; created: string }[] }> {
    return this.request(`/service-stack/${serviceStackId}/app-version`);
  }

  async getSubdomainUrl(serviceStackId: string): Promise<string | null> {
    const svc = await this.getServiceStack(serviceStackId);
    return svc.userData.find((d) => d.key === "zeropsSubdomain")?.content ?? null;
  }
}

const MANAGED_SERVICE_VERSIONS: Record<string, string> = {
  postgresql: "postgresql:single@16",
  mysql: "mysql:single@8",
  mongodb: "mongodb:single@7",
  valkey: "valkey:single@7.2",
  elasticsearch: "elasticsearch:single@8.16",
  rabbitmq: "rabbitmq:single@3.13",
  nats: "nats:single@2.10",
  objectstorage: "object-storage@1",
};

export function managedServiceVersion(type: string): string | null {
  return MANAGED_SERVICE_VERSIONS[type] ?? null;
}
