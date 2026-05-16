type AdminRef = {
    id: number;
    ip: string;
};

export type OfficialAdminRegistry = {
    mark(admin: AdminRef): void;
    unmark(admin: AdminRef): void;
    has(admin: AdminRef): boolean;
};

export function createOfficialAdminRegistry(): OfficialAdminRegistry {
    const officialAdminIds = new Set<number>();
    const officialAdminIps = new Set<string>();

    return {
        mark: (admin) => {
            officialAdminIds.add(admin.id);
            officialAdminIps.add(admin.ip);
        },
        unmark: (admin) => {
            officialAdminIds.delete(admin.id);
        },
        has: (admin) =>
            officialAdminIds.has(admin.id) || officialAdminIps.has(admin.ip),
    };
}
