package hub

import (
	"world/internal/messages"
)

// handleCameraToggle processes a user toggling their camera
func (h *Hub) handleCameraToggle(client *Client, payload messages.IncomingPayload) {
	if client.SpaceID == "" {
		return
	}

	h.mu.RLock()
	space, exists := h.Spaces[client.SpaceID]
	h.mu.RUnlock()
	if !exists {
		return
	}

	space.mu.Lock()
	defer space.mu.Unlock()

	// Find active meeting
	for _, state := range space.MeetingStates {
		if state.Status == MeetingStatusActive && (state.UserA == client.UserID || state.UserB == client.UserID) {
			var peerID string
			if state.UserA == client.UserID {
				peerID = state.UserB
			} else {
				peerID = state.UserA
			}

			if peerClient, ok := space.Users[peerID]; ok {
				msg := messages.BaseMessage{
					Type: messages.TypeCameraToggle,
					Payload: map[string]interface{}{
						"peerId":  client.UserID,
						"enabled": payload.Enabled,
					},
				}
				peerClient.SendJSON(msg)
			}
			break
		}
	}
}
