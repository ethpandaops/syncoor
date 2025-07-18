package api

import (
	"encoding/json"
	"time"

	"github.com/ethpandaops/syncoor/pkg/reporting"
	"github.com/r3labs/sse/v2"
)

func (s *Server) setupSSEStreams() {
	s.sseServer.CreateStream("tests")
}

func (s *Server) publishTestStart(runID string, test *TestData) {
	event := SSEEvent{
		Type:      "test_start",
		RunID:     runID,
		Timestamp: time.Now(),
		Data: map[string]interface{}{
			"network":   test.Network,
			"el_client": test.ELClient.Type,
			"cl_client": test.CLClient.Type,
			"labels":    test.Labels,
		},
	}
	s.publishEvent(event)
}

func (s *Server) publishTestProgress(runID string, metrics *reporting.ProgressMetrics) {
	event := SSEEvent{
		Type:      "test_progress",
		RunID:     runID,
		Timestamp: time.Now(),
		Data:      metrics,
	}
	s.publishEvent(event)
}

func (s *Server) publishTestComplete(runID string, success bool, error string) {
	event := SSEEvent{
		Type:      "test_complete",
		RunID:     runID,
		Timestamp: time.Now(),
		Data: map[string]interface{}{
			"success": success,
			"error":   error,
		},
	}
	s.publishEvent(event)
}

func (s *Server) publishEvent(event SSEEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		s.log.WithError(err).Error("Failed to marshal SSE event")
		return
	}

	s.sseServer.Publish("tests", &sse.Event{
		Data: data,
	})
}
