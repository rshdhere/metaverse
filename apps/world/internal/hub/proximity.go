package hub

import (
	"math"
	"time"
)

const (
	ProximityEnter = "enter"
	ProximityLeave = "leave"
	// VideoDwellDuration is how long users must stay in video proximity before triggering a meeting prompt.
	VideoDwellDuration = 3 * time.Second
)

type ProximityEvent struct {
	Type    string `json:"type"`
	UserA   string `json:"userA"`
	UserB   string `json:"userB"`
	SpaceID string `json:"spaceId,omitempty"`
	Media   string `json:"media,omitempty"`
}

// dwellKey generates a consistent key for a user pair (sorted alphabetically).
func dwellKey(userA, userB string) string {
	if userA > userB {
		userA, userB = userB, userA
	}
	return userA + ":" + userB
}

func (s *Space) UpdateProximityForUser(
	user *Client,
	radius float64,
	media string,
) []ProximityEvent {
	if radius <= 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	events := make([]ProximityEvent, 0)
	proximity := s.getProximityMapLocked(media)
	userSet, ok := proximity[user.UserID]
	if !ok {
		userSet = make(map[string]bool)
		proximity[user.UserID] = userSet
	}

	userX, userY := user.GetPosition()
	now := time.Now()

	for otherID, other := range s.Users {
		if otherID == user.UserID {
			continue
		}

		otherX, otherY := other.GetPosition()
		inRange := distance(userX, userY, otherX, otherY) <= radius
		wasInRange := userSet[otherID]

		if inRange {
			if media == "video" {
				// For video, use dwell timer
				key := dwellKey(user.UserID, otherID)
				if !wasInRange {
					// Just entered range - start dwell timer
					if _, hasDwell := s.VideoDwellStart[key]; !hasDwell {
						s.VideoDwellStart[key] = now
					}
				}
				// Check if dwell time has passed
				if dwellStart, hasDwell := s.VideoDwellStart[key]; hasDwell {
					if now.Sub(dwellStart) >= VideoDwellDuration {
						// Dwell time passed! Mark as in range and emit enter event
						if !wasInRange {
							userSet[otherID] = true
							otherSet, ok := proximity[otherID]
							if !ok {
								otherSet = make(map[string]bool)
								proximity[otherID] = otherSet
							}
							otherSet[user.UserID] = true
						}
						delete(s.VideoDwellStart, key)
						events = append(events, ProximityEvent{
							Type:    ProximityEnter,
							UserA:   user.UserID,
							UserB:   otherID,
							SpaceID: s.ID,
							Media:   media,
						})
					}
				}
			} else if !wasInRange {
				// For audio, emit immediately
				userSet[otherID] = true
				otherSet, ok := proximity[otherID]
				if !ok {
					otherSet = make(map[string]bool)
					proximity[otherID] = otherSet
				}
				otherSet[user.UserID] = true
				events = append(events, ProximityEvent{
					Type:    ProximityEnter,
					UserA:   user.UserID,
					UserB:   otherID,
					SpaceID: s.ID,
					Media:   media,
				})
			}
		}

		if !inRange && wasInRange {
			// Users left proximity range
			delete(userSet, otherID)
			if otherSet, ok := proximity[otherID]; ok {
				delete(otherSet, user.UserID)
			}
			if media == "video" {
				// Clear dwell timer
				key := dwellKey(user.UserID, otherID)
				delete(s.VideoDwellStart, key)
			}
			events = append(events, ProximityEvent{
				Type:    ProximityLeave,
				UserA:   user.UserID,
				UserB:   otherID,
				SpaceID: s.ID,
				Media:   media,
			})
		} else if !inRange && !wasInRange && media == "video" {
			// Users not in range and weren't before - clear any stale dwell timer
			key := dwellKey(user.UserID, otherID)
			delete(s.VideoDwellStart, key)
		}
	}

	return events
}

func (s *Space) getProximityMapLocked(media string) map[string]map[string]bool {
	if media == "video" {
		return s.VideoProximity
	}
	return s.AudioProximity
}

func distance(x1, y1, x2, y2 float64) float64 {
	return math.Hypot(x1-x2, y1-y2)
}
