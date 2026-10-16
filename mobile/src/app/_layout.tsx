import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProjectProvider } from "../state/ProjectContext";

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? MD3DarkTheme : MD3LightTheme;
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <ProjectProvider>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerStyle: { backgroundColor: theme.colors.surface }, headerTintColor: theme.colors.onSurface }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="projects/[pid]/boxes/[n]/index" options={{ title: "Коробка" }} />
            <Stack.Screen name="projects/[pid]/boxes/[n]/label" options={{ title: "Этикетка" }} />
          </Stack>
        </ProjectProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
