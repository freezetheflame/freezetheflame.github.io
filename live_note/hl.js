let states = {
    neutral: {
        //Post your other emotions as a comment
        face: {
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0
        },
        left: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: 0,
                position: 0
            }
        },
        right: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: 0,
                position: 0
            }
        }
    },
    happy: {
        face: {
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0
        },
        left: {
            lower: {
                rotation: 20,
                position: 40
            },
            upper: {
                rotation: 0,
                position: 0
            }
        },
        right: {
            lower: {
                rotation: -20,
                position: 40
            },
            upper: {
                rotation: 0,
                position: 0
            }
        }
    },
    sad: {
        face: {
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0
        },
        left: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: -20,
                position: 40
            }
        },
        right: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: 20,
                position: 40
            }
        }
    },
    close: {
        face: {
            rotationX: -20,
            rotationY: 0,
            rotationZ: 0
        },
        left: {
            lower: {
                rotation: 0,
                position: 45
            },
            upper: {
                rotation: 0,
                position: 45
            }
        },
        right: {
            lower: {
                rotation: 0,
                position: 45
            },
            upper: {
                rotation: 0,
                position: 45
            }
        }
    },
    angry: {
        face: {
            rotationX: -10,
            rotationY: 0,
            rotationZ: 0
        },
        left: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: 20,
                position: 40
            }
        },
        right: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: -20,
                position: 40
            }
        }
    },
    confused: {
        face: {
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0
        },
        left: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: 0,
                position: 40
            }
        },
        right: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: 0,
                position: 0
            }
        }
    },
    suspicious: {
        face: {
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0
        },
        left: {
            lower: {
                rotation: -4,
                position: 20
            },
            upper: {
                rotation: 4,
                position: 20
            }
        },
        right: {
            lower: {
                rotation: 4,
                position: 20
            },
            upper: {
                rotation: -4,
                position: 20
            }
        }
    },
    pain: {
        face: {
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0
        },
        left: {
            lower: {
                rotation: 10,
                position: 20
            },
            upper: {
                rotation: -10,
                position: 20
            }
        },
        right: {
            lower: {
                rotation: -10,
                position: 20
            },
            upper: {
                rotation: 10,
                position: 20
            }
        }
    },
    unamused: {
        face: {
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0
        },
        left: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: 0,
                position: 40
            }
        },
        right: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: 0,
                position: 40
            }
        }
    },
    unsure: {
        face: {
            rotationX: 0,
            rotationY: 0,
            rotationZ: 7
        },
        left: {
            lower: {
                rotation: 10,
                position: 20
            },
            upper: {
                rotation: -10,
                position: 20
            }
        },
        right: {
            lower: {
                rotation: 0,
                position: 0
            },
            upper: {
                rotation: 0,
                position: 0
            }
        }
    }
};

const setState = (state) => {
    console.log(state);
    if (states[state] == undefined) return;
    $(".face").attr(
        "style",
        `
        --left-lower-rotation:${states[state].left.lower.rotation}deg;
        --left-lower-position:${states[state].left.lower.position}%;
        --left-upper-rotation:${states[state].left.upper.rotation}deg;
        --left-upper-position:${states[state].left.upper.position}%;
        --right-lower-rotation:${states[state].right.lower.rotation}deg;
        --right-lower-position:${states[state].right.lower.position}%;
        --right-upper-rotation:${states[state].right.upper.rotation}deg;
        --right-upper-position:${states[state].right.upper.position}%;
        --face-rotation-x:${states[state].face.rotationX}deg;
        --face-rotation-y:${states[state].face.rotationY}deg;
        --face-rotation-z:${states[state].face.rotationZ}deg;
    `
    );
};

let emotions = Object.keys(states);
//let index = 3;
let previous = ["happy"];
setState("happy");

const nextState = () => {
    let ind = Math.floor(Math.random() * emotions.length);
    if (previous.indexOf(ind) != -1) return nextState();
    previous.push(ind);
    previous = previous.slice(-4); //Save most recent 4 states to not use
    return ind;
};

setInterval(() => {
    setState(emotions[nextState()]);
    //setState(emotions[index%emotions.length]);
    //index++;
}, 1500);
