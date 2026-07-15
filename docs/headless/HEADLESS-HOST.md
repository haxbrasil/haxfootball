# HaxBall Headless Host API

The headless host lets server code create and control a HaxBall room without a browser UI. The main entrypoint is `HBInit(config)`, which returns a `RoomObject` used to change room settings, move players, inspect game state, send messages, and subscribe to room events.

Most methods that change room state are applied asynchronously by the room. If code changes state and immediately reads it back, the read may still show the previous state. Use callbacks or a later game tick when you need the confirmed state.

## Creating a Room

```ts
const room = HBInit({
    roomName: "HaxFootball",
    maxPlayers: 30,
    public: true,
    noPlayer: true,
    token: process.env.TOKEN,
});

room.onRoomLink = (link) => {
    console.log(link);
};
```

`HBInit(config)` starts opening the room and returns the room controller immediately. `onRoomLink` is called when the playable room link is available.

### RoomConfigObject

```ts
interface RoomConfigObject {
    roomName: string;
    playerName?: string;
    password?: string;
    maxPlayers: number;
    public?: boolean;
    geo?: { code: string; lat: number; lon: number };
    token?: string;
    noPlayer?: boolean;
    proxy?: string;
}
```

`roomName` is the room name shown to players. `playerName` is the host player's name when `noPlayer` is not enabled.

`password` sets the join password. Omit it or set it to `null` later with `setPassword(null)` to run without a password.

`maxPlayers` is the normal room player limit. `public` controls whether the room appears in the public room list.

`geo` overrides the room location shown in the room list. Use a country code and latitude/longitude values.

`token` is the headless token used to create the room. `noPlayer` creates the room without a host player in the player list. `proxy` routes the room connection through an HTTPS proxy.

The returned room may also expose these creation helpers:

```ts
room.cancel?.();
room.useRecaptchaToken?.("token");
```

`cancel()` cancels room creation while the room is opening, or leaves the room after it has opened. `useRecaptchaToken(token)` supplies a recaptcha token to an opening room.

## Chat and Announcements

```ts
room.sendChat(message, targetId?);
```

Sends a normal chat message from the host. If `targetId` is omitted, the message is sent to everyone. If `targetId` is provided, only that player receives it.

```ts
room.sendAnnouncement(message, targetId?, color?, style?, sound?);
```

Sends a room announcement. Announcements work even when the room has no host player and support longer text than normal chat. `color` is either a numeric RGB value such as `0xff0000` or a supported color string. `style` may be `"normal"`, `"bold"`, `"italic"`, `"small"`, `"small-bold"`, or `"small-italic"`. `sound` may be `0` for no sound, `1` for chat sound, or `2` for notification sound.

## Player Management

```ts
room.setPlayerAdmin(playerId, admin);
```

Grants or removes admin rights for a player.

```ts
room.setPlayerTeam(playerId, team);
```

Moves a player to spectators, red, or blue. Team values are `0` for spectators, `1` for red, and `2` for blue.

```ts
room.kickPlayer(playerId, reason, ban);
```

Kicks a player from the room. If `ban` is `true`, the player is also banned. `reason` is shown to the kicked player.

```ts
room.reorderPlayers(playerIdList, moveToTop);
```

Reorders players in the room list. The players in `playerIdList` are removed from their current positions and inserted in that order. If `moveToTop` is `true`, they are inserted at the top; otherwise they are inserted at the bottom.

```ts
room.setPlayerAvatar(playerId, avatar);
```

Overrides a player's avatar. Passing `null` clears the room override and lets the player's own avatar show again.

```ts
room.setPlayerIdentity(playerId, data, targetId?);
```

Sends identity data for a player. If `targetId` is provided, only that recipient gets the update.

## Bans

```ts
room.clearBan(playerId);
```

Clears the ban associated with a player id.

```ts
room.clearBans();
```

Clears all room bans.

```ts
room.addPlayerBan(playerId);
```

Adds a ban for the current connection/auth information of a player and returns the ban entry id, or `null` if the ban could not be created.

```ts
room.addIpBan(...ips);
```

Adds one or more IP bans. Each argument can be an IP string or an IP range object. Returns one ban entry id per argument.

```ts
room.addAuthBan(...auths);
```

Adds one or more auth bans. Returns one ban entry id per auth.

```ts
room.removeBan(id);
```

Removes a ban by ban entry id. Returns whether a ban was removed.

## Room Settings

```ts
room.setScoreLimit(limit);
```

Sets the score limit. If a game is already running, the change may not apply until the game is stopped.

```ts
room.setTimeLimit(limit);
```

Sets the time limit in minutes. If a game is already running, the change may not apply until the game is stopped.

```ts
room.setTeamsLock(locked);
```

Enables or disables team lock. When teams are locked, players cannot move themselves between teams unless an admin moves them.

```ts
room.setTeamColors(team, angle, textColor, colors);
```

Sets a team's shirt colors. `team` must be red or blue. `angle` controls stripe angle, `textColor` controls number/name color, and `colors` is the list of shirt colors as numeric RGB values.

```ts
room.setPassword(password);
```

Changes the room password. Pass `null` to remove the password.

```ts
room.setRequireRecaptcha(required);
```

Controls whether joining players must pass recaptcha.

```ts
room.setDesyncCheckerEnabled(enabled);
room.setDesyncCheckerIntervalTicks(intervalTicks);
```

Enables or disables periodic live-client checksum comparisons and configures the positive number of game ticks between comparisons. The checker is enabled by default.

```ts
room.setKickRateLimit(min, rate, burst);
```

Sets the kick rate limiter. `min` is the minimum number of game ticks between kicks. `rate` controls how quickly saved kicks recover. `burst` controls how many extra kicks can be saved.

```ts
room.setProperties(properties);
```

Updates multiple room properties at once. Supported fields include room name, password, geo, current player count, maximum player count, fake password state, unlimited player count state, and public room-list visibility.

```ts
room.setHandicap(handicap);
```

Sets the room handicap value. Handicap affects network delay compensation for players.

```ts
room.setUnlimitedPlayerCount(on);
```

Allows or disallows player counts above the configured room maximum.

```ts
room.setFakePassword(fakePassword);
```

Controls the password indicator shown for the room without changing the real password. Pass `true`, `false`, or `null` to restore the normal indicator.

## Stadium and Game Control

```ts
room.setCustomStadium(stadiumFileContents);
```

Loads a custom stadium from `.hbs` file contents. The game must be stopped for the change to apply.

```ts
room.setDefaultStadium(stadiumName);
```

Selects one of HaxBall's built-in stadiums by exact name. The game must be stopped for the change to apply.

```ts
room.setCurrentStadium(stadium);
```

Sets the current stadium from a parsed stadium object. Use this when code already has a stadium object instead of raw `.hbs` text.

```ts
room.startGame();
room.stopGame();
```

Starts or stops the current game. Calling `startGame()` while a game is running, or `stopGame()` while no game is running, has no effect.

```ts
room.pauseGame(pauseState);
```

Pauses or unpauses the game.

```ts
room.isGamePaused();
```

Returns whether the current game is paused.

```ts
room.autoTeams();
room.randTeams();
```

`autoTeams()` assigns players to teams using the room's automatic team balancer. `randTeams()` randomly distributes players between teams.

```ts
room.resetTeam(teamId);
room.resetTeams();
```

Moves players from a team, or from all teams, back to spectators.

## Room Lifecycle

```ts
room.leave();
```

Leaves and closes the room.

```ts
room.setConfig(config);
room.mixConfig(config);
```

Replaces or merges room configuration used by the host runtime. `setConfig` replaces the active configuration object. `mixConfig` applies partial changes over the current configuration.

```ts
room.takeSnapshot();
```

Returns an object representing the current room state. Use it for diagnostics, state transfer, or debugging tools.

## Reading Game State

```ts
room.getPlayer(playerId);
```

Returns the player with the given id, or `null` if that player is not in the room.

```ts
room.getPlayerList();
```

Returns the current list of players.

```ts
room.getScores();
```

Returns current score information when a game is running, or `null` when there is no active game.
Inside `onGameStop`, scores may already be cleared. Code that needs final score/time should preserve values cached during `onGameTick` or earlier callbacks instead of overwriting them from `getScores()`.

```ts
room.getBallPosition();
```

Returns the ball position as `{ x, y }`, or `null` when there is no active game.

```ts
room.getBall(extrapolated?);
room.getDiscs(extrapolated?);
room.getDisc(discId, extrapolated?);
room.getPlayerDisc(playerId, extrapolated?);
room.getPlayerDisc_exp(playerId);
```

Reads live disc objects. `getBall()` returns the ball disc. `getDiscs()` returns all discs. `getDisc(discId)` returns one disc. `getPlayerDisc(playerId)` returns the disc controlled by a player. When `extrapolated` is `true`, the returned object uses extrapolated positions. `getPlayerDisc_exp(playerId)` returns the extrapolated player disc directly.

```ts
room.extrapolate(milliseconds, ignoreMultipleCalls?);
```

Advances a predicted copy of the room state by the requested number of milliseconds and returns the extrapolated state object.

## Disc Properties

```ts
room.setDiscProperties(discIndex, properties);
```

Changes properties of a disc. Omitted or `null` properties are left unchanged. This can move discs, change speed, gravity, radius, damping, color, collision mask, or collision group.

```ts
room.getDiscProperties(discIndex);
```

Returns the properties of a disc, or `null` if the disc index does not exist.

```ts
room.setPlayerDiscProperties(playerId, properties);
```

Changes properties of the disc controlled by a player.

```ts
room.getPlayerDiscProperties(playerId);
```

Returns the disc properties for the disc controlled by a player, or `null` if the player does not have a disc.

```ts
room.getDiscCount();
```

Returns the total number of discs in the current stadium, including the ball and player discs.

## Host Player Controls

These methods control the host player when the room has one.

```ts
room.setAvatar(avatar);
```

Changes the host player's avatar.

```ts
room.setChatIndicatorActive(active);
```

Shows or hides the host player's typing indicator.

```ts
room.getKeyState();
```

Returns the current host player input bitmask.

```ts
room.setKeyState(state, instant?);
```

Sets the host player input bitmask. If `instant` is true, the state is applied immediately.

```ts
room.setSync(value);
```

Enables or disables sync for the host player.

```ts
room.changeTeam(teamId);
```

Moves the host player to spectators, red, or blue.

## Custom Events and Operations

```ts
room.sendCustomEvent(type, data, targetId?);
```

Sends a custom JSON data event to players. If `targetId` is omitted, the event is sent to everyone.

```ts
room.sendBinaryCustomEvent(type, data, targetId?);
```

Sends a custom binary event. `data` must be a `Uint8Array`.

```ts
room.executeEvent(event, byId);
```

Executes a room operation object as if it was sent by the player id in `byId`.

```ts
room.executeEventWithTarget(event, targetId);
```

Executes a room operation object for a specific target player.

```ts
room.clearEvents();
```

Clears queued room operations that have not been processed yet.

## Recording, Streaming, Plugins, and Rendering

```ts
room.startRecording();
room.stopRecording();
```

Starts and stops replay recording. `stopRecording()` returns replay bytes as a `Uint8Array`, or `null` if recording was not active.

```ts
room.startStreaming(params);
room.stopStreaming();
```

Starts or stops room-state streaming. `params` supplies callbacks for client count updates and emitted binary data.

```ts
room.isRecording();
```

Returns whether recording is currently active.

```ts
room.setPluginActive(pluginName, active);
```

Enables or disables a registered plugin by name.

```ts
room.addPlugin(plugin);
room.movePlugin(pluginIndex, newIndex);
room.updatePlugin(pluginIndex, plugin);
room.removePlugin(plugin);
```

Adds, reorders, replaces, or removes plugins used by the room runtime.

```ts
room.setRenderer(renderer);
```

Sets the renderer object used by the room runtime.

```ts
room.addLibrary(library);
room.moveLibrary(libraryIndex, newIndex);
room.updateLibrary(libraryIndex, library);
room.removeLibrary(library);
```

Adds, reorders, replaces, or removes support libraries used by the room runtime.

## Synthetic Player Operations

These methods create room operations programmatically. They can trigger the same callbacks as player actions, so pass the correct `byId` for authorization and auditing logic.

```ts
room.fakePlayerJoin(id, name, flag, avatar, conn, auth);
```

Creates a synthetic player join operation.

```ts
room.fakePlayerLeave(id);
```

Creates a synthetic player leave operation and returns the removed player identity data.

```ts
room.fakeSendPlayerInput(input, byId);
```

Submits an input bitmask for a player.

```ts
room.fakeSendPlayerChat(message, byId);
```

Submits a chat message as a player.

```ts
room.fakeSetPlayerChatIndicator(value, byId);
```

Sets a player's typing indicator.

```ts
room.fakeSetPlayerAvatar(value, byId);
```

Sets a player's avatar.

```ts
room.fakeSetPlayerAdmin(playerId, value, byId);
```

Changes a player's admin state as if requested by `byId`.

```ts
room.fakeSetPlayerSync(value, byId);
```

Changes a player's sync state.

```ts
room.fakeSetStadium(stadium, byId);
```

Sets the current stadium as if requested by `byId`.

```ts
room.fakeStartGame(byId);
room.fakeStopGame(byId);
room.fakeSetGamePaused(value, byId);
```

Starts, stops, pauses, or unpauses the game as if requested by `byId`.

```ts
room.fakeSetScoreLimit(value, byId);
room.fakeSetTimeLimit(value, byId);
room.fakeSetTeamsLock(value, byId);
```

Changes score limit, time limit, or team lock as if requested by `byId`.

```ts
room.fakeAutoTeams(byId);
room.fakeSetPlayerTeam(playerId, teamId, byId);
```

Runs auto-teams or moves a player to a team as if requested by `byId`.

```ts
room.fakeSetKickRateLimit(min, rate, burst, byId);
```

Changes the kick rate limit as if requested by `byId`.

```ts
room.fakeSetTeamColors(teamId, angle, colors, byId);
```

Changes a team's colors as if requested by `byId`.

```ts
room.fakeKickPlayer(playerId, reason, ban, byId);
```

Kicks or bans a player as if requested by `byId`.

## Events

Assign callbacks on the room object to observe room activity.

```ts
room.onPlayerJoin = (player) => {};
```

Called when a player joins.

```ts
room.onPlayerLeave = (player) => {};
```

Called when a player leaves.

```ts
room.onTeamVictory = (scores) => {};
```

Called when a team wins because the score or time limit was reached.

```ts
room.onPlayerChat = (player, message) => {};
```

Called when a player sends a chat message. Return `false` to block the message.

```ts
room.onPlayerBallKick = (player) => {};
```

Called when a player kicks the ball.

```ts
room.onTeamGoal = (team) => {};
```

Called when a team scores.

```ts
room.onGameStart = (byPlayer) => {};
room.onGameStop = (byPlayer) => {};
```

Called when a game starts or stops. `byPlayer` is the player who caused the event, or `null` for host-originated changes.

```ts
room.onPlayerAdminChange = (changedPlayer, byPlayer) => {};
room.onPlayerTeamChange = (changedPlayer, byPlayer) => {};
```

Called when a player's admin status or team changes.

```ts
room.onBeforeKick = (player, reason, ban, byPlayer) => {};
```

Called before a kick or ban is applied. Return `false` to block the operation.

```ts
room.onPlayerKicked = (kickedPlayer, reason, ban, byPlayer) => {};
```

Called after a player is kicked or banned.

```ts
room.onGameTick = () => {};
```

Called once per game tick while the game is running and not paused.

```ts
room.onGamePause = (byPlayer) => {};
room.onGameUnpause = (byPlayer) => {};
```

Called when the game is paused or unpaused.

```ts
room.onPositionsReset = () => {};
```

Called when player and ball positions reset after a goal.

```ts
room.onPlayerActivity = (player) => {};
```

Called when a player provides input or otherwise shows activity.

```ts
room.onStadiumChange = (newStadiumName, byPlayer) => {};
```

Called when the current stadium changes.

```ts
room.onRoomLink = (link) => {};
```

Called when the room link is available.

```ts
room.onKickRateLimitSet = (min, rate, burst, byPlayer) => {};
```

Called when the kick rate limit changes.

```ts
room.onTeamsLockChange = (locked, byPlayer) => {};
```

Called when team lock is enabled or disabled.

## Data Shapes

```ts
interface PlayerObject {
    id: number;
    name: string;
    team: 0 | 1 | 2;
    admin: boolean;
    position: { x: number; y: number } | null;
    conn: string;
    auth?: string;
    ip: string;
}
```

`id` is stable for the player's stay in the room. `conn` identifies the connection. `auth` is the player's public auth id when available. `ip` is the player IP address when available to the host. `position` is `null` when the player does not currently have an active disc.

```ts
interface ScoresObject {
    red: number;
    blue: number;
    time: number;
    scoreLimit: number;
    timeLimit: number;
}
```

`time` is elapsed game time in seconds. It does not advance while the game is paused.

```ts
interface DiscPropertiesObject {
    x?: number | null;
    y?: number | null;
    xspeed?: number | null;
    yspeed?: number | null;
    xgravity?: number | null;
    ygravity?: number | null;
    radius?: number | null;
    bCoeff?: number | null;
    invMass?: number | null;
    damping?: number | null;
    color?: number | null;
    cMask?: number | null;
    cGroup?: number | null;
}
```

Disc properties use stadium physics names. `cMask` and `cGroup` are collision bit fields. Use `room.CollisionFlags` to read or compose collision values.

```ts
type TeamID = 0 | 1 | 2;
```

`0` is spectators, `1` is red, and `2` is blue.

## CollisionFlags

```ts
const cf = room.CollisionFlags;
```

`CollisionFlags` contains helper constants for disc collision groups and masks: `all`, `ball`, `red`, `blue`, `redKO`, `blueKO`, `wall`, `kick`, `score`, `c0`, `c1`, `c2`, and `c3`.

```ts
const disc = room.getDiscProperties(4);
const hasBallFlag = (disc.cGroup & room.CollisionFlags.ball) !== 0;

room.setDiscProperties(5, {
    cMask: disc.cMask | room.CollisionFlags.wall,
});
```
