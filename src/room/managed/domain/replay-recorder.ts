import type { Room } from "@core/room";

export class ReplayRecorder {
    private recording = false;

    start(room: Room): void {
        if (this.recording) {
            room.stopRecording();
        }

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

    stop(room: Room): Uint8Array | null {
        if (!this.recording) return null;

        this.recording = false;

        try {
            return room.stopRecording();
        } catch (error) {
            console.error("Failed to stop HaxBall replay recording:", error);
            return null;
        }
    }
}
