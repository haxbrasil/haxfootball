type GuardRequest = {
    actorId: number;
    timestamp: number;
};

export const createGuard = (now: () => number = Date.now) => {
    const requests = new Map<string, GuardRequest>();

    return {
        tryAcquire(
            guardId: string,
            actorId: number,
            windowMs: number,
        ): boolean {
            const timestamp = now();
            const lastRequest = requests.get(guardId);

            if (
                lastRequest &&
                lastRequest.actorId !== actorId &&
                timestamp - lastRequest.timestamp < windowMs
            ) {
                return false;
            }

            requests.set(guardId, { actorId, timestamp });
            return true;
        },
    };
};

export const guard = createGuard();
