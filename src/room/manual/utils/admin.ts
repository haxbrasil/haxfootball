type AdminRef = {
    id: number;
    ip: string;
};

const officialAdminIds = new Set<number>();
const officialAdminIps = new Set<string>();

export function markOfficialAdmin(admin: AdminRef): void {
    officialAdminIds.add(admin.id);
    officialAdminIps.add(admin.ip);
}

export function unmarkOfficialAdmin(admin: AdminRef): void {
    officialAdminIds.delete(admin.id);
}

export function isOfficialAdmin(admin: AdminRef): boolean {
    return officialAdminIds.has(admin.id) || officialAdminIps.has(admin.ip);
}
