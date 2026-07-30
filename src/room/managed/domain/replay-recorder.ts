import type { Room } from "@core/room";

export class ReplayRecorder {
    private recording = false;

    start(room: Room): void {
        if (this.recording) return;

        try {
            this.recording = room.startRecording();

            if (!this.recording) {
                console.error("Failed to start HaxBall replay recording.");
            }
        } catch (error) {
            this.recording = false;
            console.error("Failed to start HaxBall replay recording:", error);
        }
    }

    async snapshot(room: Room): Promise<Uint8Array | null> {
        if (!this.recording) return null;

        try {
            return await room.snapshotRecordingAsync();
        } catch (error) {
            console.error(
                "Failed to snapshot HaxBall replay recording:",
                error,
            );
            return null;
        }
    }
}
