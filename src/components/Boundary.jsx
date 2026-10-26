import { Component } from 'react';

/**
 * The last line of defence.
 *
 * When a React component throws, React unmounts the whole tree -- and since
 * this app is a dark map, "the whole tree" looks exactly like a black
 * screen with no explanation. That is the worst thing it could do: someone
 * standing in a field cannot tell a crash from a dead phone.
 *
 * This catches it, says what happened, and offers the one thing that always
 * works. It is the only class component in the project because an error
 * boundary is the one thing hooks cannot do.
 */
export default class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: null };
  }

  static getDerivedStateFromError(error) {
    return { failed: error };
  }

  componentDidCatch(error) {
    // Left in deliberately: if this ever fires in front of someone, the
    // console is where the reason has to be.
    console.error('DeltaWatch stopped:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="broke">
        <h1>DeltaWatch stopped</h1>
        <p>
          Something in the app threw an error, so it shut down rather than show you
          numbers it could not stand behind.
        </p>
        <p className="muted small">{String(this.state.failed?.message ?? this.state.failed)}</p>
        <button type="button" onClick={() => window.location.reload()}>Reload</button>
        <p className="muted small">
          In an emergency call 911. This app is a planning aid, not a warning system.
        </p>
      </div>
    );
  }
}
