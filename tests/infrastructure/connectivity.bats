#!/usr/bin/env bats

load test_helper

# --- DNS resolution ---

@test "service-b DNS resolves from service-a pod" {
  run exec_in_pod service-a wget --spider -q http://service-b:3001/health
  [ "$status" -eq 0 ]
}

@test "service-a DNS resolves from service-b pod" {
  run exec_in_pod service-b wget --spider -q http://service-a:3000/health
  [ "$status" -eq 0 ]
}

# --- Health endpoints reachable inside cluster ---

@test "service-a: /health returns ok from inside cluster" {
  run exec_in_pod service-a wget -qO- http://localhost:3000/health
  [ "$status" -eq 0 ]
  [[ "$output" =~ "service-a" ]]
}

@test "service-b: /health returns ok from inside cluster" {
  run exec_in_pod service-b wget -qO- http://localhost:3001/health
  [ "$status" -eq 0 ]
  [[ "$output" =~ "service-b" ]]
}

# --- Service-to-service communication ---

@test "service-a can reach service-b /info via K8s DNS" {
  run exec_in_pod service-a wget -qO- http://service-b:3001/info
  [ "$status" -eq 0 ]
  [[ "$output" =~ "service-b" ]]
}

@test "service-a /data returns downstream data from service-b" {
  run exec_in_pod service-a wget -qO- http://localhost:3000/data
  [ "$status" -eq 0 ]
  [[ "$output" =~ "service-a" ]]
  [[ "$output" =~ "service-b" ]]
}
